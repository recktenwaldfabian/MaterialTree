/*global logger*/
/*
MaterialTree
========================

@file      : MaterialTree.js
@version   : 1.0.0
@author    : Fabian Recktenwald
@date      : 2016-10-10
@copyright : Mansystems 2016
@license   : Apache 2

Documentation
========================
Describe your widget here.
*/

// Required module list. Remove unnecessary modules, you can always get them back from the boilerplate.
define([
  "dojo/_base/declare",
  "mxui/widget/_WidgetBase",
  "dijit/_TemplatedMixin",
  "MaterialTree/lib/lodash.core.4.16.6",

  "mxui/dom",
  "dojo/dom",
  "dojo/dom-prop",
  "dojo/dom-geometry",
  "dojo/dom-class",
  "dojo/dom-style",
  "dojo/dom-construct",
  "dojo/_base/array",
  "dojo/_base/lang",
  "dojo/text",
  "dojo/html",
  "dojo/_base/event",
  "dojo/on",

  "MaterialTree/lib/jquery-1.11.2",
  "dojo/text!MaterialTree/widget/template/MaterialTree.html",
  "MaterialTree/lib/jstree/jstree"
], function (declare, _WidgetBase, _TemplatedMixin, _ , dom, dojoDom, dojoProp, dojoGeometry, dojoClass, dojoStyle, dojoConstruct, dojoArray, dojoLang, dojoText, dojoHtml, dojoEvent, dojoOn, _jQuery, widgetTemplate ) {
  "use strict";

  var $ = _jQuery.noConflict(true);

  // Declare widget's prototype.
  return declare("MaterialTree.widget.MaterialTree", [ _WidgetBase, _TemplatedMixin ], {
    // _TemplatedMixin will create our dom node using this HTML template.
    templateString: widgetTemplate,

    // Parameters configured in the Modeler.
    mfRootData: "", // microflow providing the first tree level; receives context object
    mfNodeData: "", // microflow providing children of a node; receives the parent node object

    treeEntity: '', // entity used for tree nodes
    selectionReference: '', // path to selected entry

    displayAttribute: "", // attribute containing the text displayed in a node
    displayAttributeJSON: "", // if this is set, the given attribute must contain a JSON array of data entries
    // the format of this array is [ entry, entry ...] where
    // entry = { "type" : "sometype" } // display icon of references type
    // or
    // entry = { "text" : "sometext" } // display some text
    // where "sometype" refers to the types defined in typemaaing

    // example
    // [ { "type" : "question"}, { "text" : "what do you want" }, { "type" : "smile" } ]


    expandableAttribute: "", // determines if a node can be expanded (has children)
    openedAttribute: "", // determines if a node is initially open

    mfOnChange: "", // microflow triggered when a node is selected

    typeAttribute: "", //
    typeMapping: "", //

    // Internal variables. Non-primitives created in the prototype are shared between all widget instances.
    _handles: null,
    _contextObj: null,
    _jstree: null,
    _treeTypeMapping: null,

    // dojo.declare.constructor is called to construct the widget instance. Implement to initialize non-primitive properties.
    constructor: function () {
      logger.debug(this.id + ".constructor");
      this._handles = [];
    },

    // dijit._WidgetBase.postCreate is called after constructing the widget. Implement to do extra setup work.
    postCreate: function () {
      logger.debug(this.id + ".postCreate");
    },

    // mxui.widget._WidgetBase.update is called when context is changed or initialized. Implement to re-render and / or fetch data.
    update: function (obj, update_callback) {
      logger.debug(this.id + ".update");

      this._contextObj = obj;

      this.subscribe({
        guid: this._contextObj.getGuid(),
        callback: dojoLang.hitch( this, '_clientRefreshContext'),
      });

      this._treeTypeMapping = {};
      this.typeMapping.forEach( function( mapentry ) {
        this._treeTypeMapping[ mapentry.type ] = {
          'icon' : './'+mapentry.icon,
          'title' : mapentry.title
        };
      }, this);

      this._jstree = $(this.domNode).jstree({
        'core' : {
          'multiple' : false,
          'data' : dojoLang.hitch( this, '_treeDataSource'),
          // allow modifications to the tree
          'check_callback' : function (operation, node, node_parent, node_position, more) {
            return true;
          },
        },
        'types' : this._treeTypeMapping,
        'plugins' : [ 'types' ]

      }).on( 'changed.jstree', dojoLang.hitch( this, '_changed_jstree') )
      .on( 'load_node.jstree', dojoLang.hitch( this, '_load_node_jstree') );

      this._jstree = $(this.domNode).jstree(true);

      //this._resetSubscriptions();
      mendix.lang.nullExec(update_callback);
    },

    _changed_jstree: function( e, data ) {
      logger.debug(this.id + ".jstree.changed");

      var event = data.event;

      if ( data.action == 'select_node' ) {
        var nodeObj = data.node.original.obj;

        if ( this.mfOnChange ) {
          mx.ui.action( this.mfOnChange, {
            params: {
              applyto: "selection",
              guids: [ nodeObj.getGuid() ]
            },
            scope: this.mxform,
            callback: function() {
              // mf call ok
            }
          }, this );
        }
      } else if ( data.action == 'delete_node' ) {
        // do something on delete
      } else if ( data.action == 'ready' ){
        // do something when tree is ready
      }
    },

    _load_node_jstree: function( e, data ) {
      logger.debug(this.id + ".jstree.load_node");
      //console.log( '_load_node' );
      this._updateSelectionFromContext();
    },

    _treeDataSource: function (node, data_callback ) {
      logger.debug(this.id + "._treeDataSource");
      // this context is switched to the jsTree here
      if ( node.id == '#' ) {
        var dataMF = this.mfRootData;
        var nodeObj = this._contextObj;
      } else {
        var dataMF = this.mfNodeData;
        var nodeObj = node.original.obj;
      }

      mx.ui.action( dataMF, {
        params: {
          applyto: "selection",
          guids: [ nodeObj.getGuid() ]
        },
        origin: this.mxform,
        callback: function( objs ) {
          var newNodes = [];

          objs.forEach( function( obj ) {
            this._subscribeObjectRefresh( obj );

            newNodes.push( this._buildNodeFromObject( obj ) );
          }, this);

          data_callback.call( this._jstree, newNodes );
        }
      }, this );

    },

    _subscribeObjectRefresh: function( obj ) {
      var guid = obj.getGuid();
      this._handles[ guid ] = this.subscribe({
        guid: guid,
        callback: dojoLang.hitch( this, '_clientRefreshObject'),
      });
    },

    _unsubscribeObjectRefresh: function( guid ) {
      var handle = this._handles[ guid ];
      if ( handle ) {
        this.unsubscribe( handle );
        this._handles[ guid ] = undefined;
      }
    },

    // Called when a client refresh is triggered on a tree node object
    // * reload all children of this node (when open)
    _clientRefreshObject: function( guid ) {
      logger.debug(this.id + ".refresh[guid:"+guid+"]");
      var node = this._jstree.get_node('[objGuid='+guid+']');
      if ( node ) {
        this._reloadNode( node, this.mfNodeData, node.original.obj );
      } else {
        logger.debug(this.id + ".refresh.node-not-mounted[guid:"+guid+"]");
      }
    },

    // Called when a client refreshes the context object
    _clientRefreshContext: function( guid ) {
      logger.debug(this.id + ".refresh.context[guid:"+guid+"]");
      var node = this._jstree.get_node('#');
      this._reloadNode( node, this.mfRootData, this._contextObj );

      //console.log( 'refresh context' );
      this._updateSelectionFromContext();
    },

    _updateSelectionFromContext: function() {
      logger.debug(this.id + ".updateselection");

      if ( this.selectionReference ) {
        var referenceGuid = this._contextObj.getReference( this.selectionReference.split('/')[0] );
        this._jstree.deselect_all( true );
        if ( referenceGuid ) {
          this._jstree.select_node( '[objGuid='+referenceGuid+']', true );
        }
      }
    },

    _reloadNode: function( node, dataMF, nodeObj ) {
      logger.debug(this.id + ".reloadNode[id:"+ node.id + "][state: " + JSON.stringify(node.state) + "]" );

      if ( node.id != '#' ) {
        this._jstree.rename_node( node, this._getNodeText( nodeObj ) );
        this._jstree.set_type( node, nodeObj.get( this.typeAttribute ) );
      }

      if ( ! node.state.loaded ) {
        //this._jstree.load_node( node );
      } else {
        // load_node would simply do a hard reload (no clean refresh possible)
        // this._jstree.load_node( node );

        // refresh child nodes if node was already loaded
        mx.ui.action( dataMF, {
          params: {
            applyto: "selection",
            guids: [ nodeObj.getGuid() ]
          },
          scope: this.mxform,
          callback: function( reloadedObjs ) {
            logger.debug(this.id + ".reloadNode.callback.[id:"+ node.id + "]" );
            if (! reloadedObjs ) {
              reloadedObjs = [];
            }

            var newGuids = reloadedObjs.map( function(ro) { return ro.getGuid(); }).sort();
            var childNodes = node.children.map( function(childnodeId) { return this._jstree.get_node(childnodeId); }, this);
            var oldGuids = childNodes.map( function(childNode) { return childNode.original.obj.getGuid(); }).sort();

            //console.log( 'reloaded node ' + node.id + ', guid: ' + (node.original && node.original.obj.getGuid())  );

            var i=0, j=0;
            while ( i<newGuids.length && j<oldGuids.length ) {
              if ( newGuids[i] == oldGuids[j] ) {
                i++; j++;
              } else if ( newGuids[i] < oldGuids[j] ) {
                var newObj = _.find( reloadedObjs, function(obj) { return obj.getGuid() == newGuids[i];} );
                this._createOrMoveObjectNode( node, newObj );
                i++;
              } else {
                this._deleteObjectNode( oldGuids[j] );
                j++;
              }
            }

            while ( i<newGuids.length ) {
              var newObj = _.find( reloadedObjs, function(obj) { return obj.getGuid() == newGuids[i];} );
              this._createOrMoveObjectNode( node, newObj );
              i++;
            }

            while ( j<oldGuids.length ) {
              this._deleteObjectNode( oldGuids[j] );
              j++;
            }

            // reorder nodes according to new order provided in DS MF
            reloadedObjs.forEach( function( obj, idx ) {
              this._jstree.move_node( '[objGuid=' + obj.getGuid() + ']', node, idx );
            }, this );
          }
        }, this);
      }
    },

    _createOrMoveObjectNode: function( parentNode, obj ) {
      logger.debug(this.id + "._createOrMoveObjectNode[guid:"+ obj.getGuid() + "]" );

      // when a node was moved from a different position in the tree
      // the node may still exist and is moved from there instead of recreating
      var movedNode = this._jstree.get_node('[objGuid=' + obj.getGuid() + ']');
      if ( movedNode ) {
        // this will be handled by the move_node in reorder
        //this._jstree.move_node( moveNode, parentNode );
      } else {
        this._jstree.create_node( parentNode, this._buildNodeFromObject( obj ) );
        this._subscribeObjectRefresh( obj );
      }
    },

    _deleteObjectNode: function( guid ) {
      logger.debug(this.id + "._deleteObjectNode[guid:"+ guid + "]" );
      this._jstree.delete_node( '[objGuid='+guid+']' );
      this._unsubscribeObjectRefresh( guid );
    },

    // Create node object from MxObject using configured attributes
    _buildNodeFromObject: function( obj ) {
      var nodeConfig = {
//        id: obj.getGuid(),
        text: this._getNodeText( obj ),
        children: obj.get( this.expandableAttribute ) ? true : [],
        obj: obj,
        state: {
          opened: this.openedAttribute ? obj.get( this.openedAttribute ) : false
        },
        type: obj.get( this.typeAttribute ),
        li_attr: { objGuid: obj.getGuid() }
      };

      return nodeConfig;
    },

    _getNodeText: function( obj ) {
      if ( this.displayAttributeJSON) {
        return JSON.parse( obj.get( this.displayAttributeJSON ) ).map( function( entry ) {
          if ( entry.type ) {
            var typeEntry = this._treeTypeMapping[ entry.type ]
            if ( typeEntry ) {
              return typeEntry;
            } else {
              return { text: '['+entry.type+']'};
            }
          } else {
            return entry;
          }
        }, this);;
      } else if ( this.displayAttribute ) {
        // just return the text. This may also contain html
        return obj.get( this.displayAttribute );
      } else {
        return '<empty>';
      }
    },

    // mxui.widget._WidgetBase.uninitialize is called when the widget is destroyed. Implement to do special tear-down work.
    uninitialize: function () {
      logger.debug(this.id + ".uninitialize");
    },

  });
});

require(["MaterialTree/widget/MaterialTree"]);
