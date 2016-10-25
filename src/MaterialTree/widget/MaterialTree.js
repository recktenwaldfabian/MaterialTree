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
], function (declare, _WidgetBase, _TemplatedMixin, dom, dojoDom, dojoProp, dojoGeometry, dojoClass, dojoStyle, dojoConstruct, dojoArray, dojoLang, dojoText, dojoHtml, dojoEvent, dojoOn, _jQuery, widgetTemplate ) {
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

    displayAttribute: "", // attribute containing the text displayed in a node
    expandableAttribute: "", // determines if a node can be expanded (has children)

    mfOnChange: "", // microflow triggered when a node is selected

    typeAttribute: "", //
    typeMapping: "", //

    // Internal variables. Non-primitives created in the prototype are shared between all widget instances.
    _handles: null,
    _contextObj: null,
    _jstree: null,

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

      console.log( this.id + ".update" );

      var treeTypeMapping = {};
      this.typeMapping.forEach( function( map ) {
        treeTypeMapping[ map.type ] = {
          'icon' : './'+map.icon
        };
      });

      this._jstree = $(this.domNode).jstree({
        'core' : {
          'data' : dojoLang.hitch( this, '_treeDataSource'),
          // allow modifications to the tree
          'check_callback' : function (operation, node, node_parent, node_position, more) {
            return true;
          },
        },
        'types' : treeTypeMapping,
        'plugins' : [ 'types' ]

      }).on( 'changed.jstree', dojoLang.hitch( this, '_changed_jstree') );

      this._jstree = $(this.domNode).jstree(true);

      //this._resetSubscriptions();
      mendix.lang.nullExec(update_callback);
    },

    _changed_jstree: function( e, data ) {
      var nodeObj = data.node.original.obj;
      var event = data.event;

      if ( data.action == 'select_node' ) {
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
      } else {
        // do something on other changes?
      }
    },

    _treeDataSource: function (node, data_callback ) {
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
        scope: this.mxform,
        callback: function( objs ) {
          var newNodes = [];

          objs.forEach( function( obj ) {
            this.subscribe({
              guid: obj.getGuid(),
              callback: dojoLang.hitch( this, '_clientRefreshObject'),
            });

            newNodes.push( this._buildNodeFromObject( obj ) );
          }, this);

          data_callback.call( this._jstree, newNodes );
        }
      }, this );

    },

    // Called when a client refresh is triggered on a tree node object
    // * reload all children of this node (when open)
    _clientRefreshObject: function( guid ) {
      var node = this._jstree.get_node('[objGuid='+guid+']');
      var obj = node.original.obj;

      this._jstree.rename_node( node, obj.get( this.displayAttribute ) );
      this._jstree.set_type( node, obj.get( this.typeAttribute ) );

      if ( ! node.state.loaded ) {
        this._jstree.load_node( node );
      } else {
        // load_node would simply do a hard reload (no clean refresh possible)
        // this._jstree.load_node( node );

        // refresh child nodes if node was already loaded
        mx.ui.action( this.mfNodeData, {
          params: {
            applyto: "selection",
            guids: [ obj.getGuid() ]
          },
          scope: this.mxform,
          callback: function( reloadedObjs ) {
            var newGuids = reloadedObjs.map( function(ro) { return ro.getGuid(); }).sort();
            var childNodes = node.children.map( function(childnodeId) { return this._jstree.get_node(childnodeId); }, this);
            var oldGuids = childNodes.map( function(childNode) { return childNode.original.obj.getGuid(); }).sort();

            var i=0, j=0;
            while ( i<newGuids.length && j<oldGuids.length ) {
              if ( newGuids[i] == oldGuids[j] ) {
                i++; j++;
              } else if ( newGuids[i] < oldGuids[j] ) {
                var newObj = reloadedObjs.find( function(obj) { return obj.getGuid() == newGuids[i];} );
                this._jstree.create_node( node, this._buildNodeFromObject( newObj ) );
                this.subscribe({
                  guid: newObj.getGuid(),
                  callback: dojoLang.hitch( this, '_clientRefreshObject'),
                });
                i++;
              } else {
                this._jstree.delete_node( '[objGuid='+oldGuids[j]+']');
                j++;
              }
            }
            while ( i<newGuids.length ) {
              var newObj = reloadedObjs.find( function(obj) { return obj.getGuid() == newGuids[i];} );
              this._jstree.create_node( node, this._buildNodeFromObject( newObj ) );
              this.subscribe({
                guid: newObj.getGuid(),
                callback: dojoLang.hitch( this, '_clientRefreshObject'),
              });
              i++;
            }
            while ( j<oldGuids.length ) {
              this._jstree.delete_node( '[objGuid='+oldGuids[j]+']' );
              j++;
            }
          }
        }, this);
      }
    },

    // Create node object from MxObject using configured attributes
    _buildNodeFromObject: function( obj ) {
      return {
        id: obj.getGuid(),
        text: obj.get( this.displayAttribute ),
        children: obj.get( this.expandableAttribute ) ? true : [],
        obj: obj,
        type: obj.get( this.typeAttribute ),
        li_attr: { objGuid: obj.getGuid() }
      };
    },

    // mxui.widget._WidgetBase.uninitialize is called when the widget is destroyed. Implement to do special tear-down work.
    uninitialize: function () {
    },

  });
});

require(["MaterialTree/widget/MaterialTree"]);
