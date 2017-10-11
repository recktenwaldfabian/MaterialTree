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
    treeNode: "", // entity containing node data
    treeEdge: "", // entity containing edge data
    treeStatus: "", // entity containing filterable status for nodes
    treeNodeGroup: "", // entity grouping nodes (e.g. a common supplier of parts)

    rootNodeRef: '', // path from context to root Node
    treeEdgeParentRef: '', // path from edge to parent Node
    treeEdgeChildRef: '', // path from edge to child Node
    treeStatusRef: '', // association from status to node
    treeNodeGroupRef: '', // association from node to node group

    treeStatusConstrainedRef: '', // association from status to a contrained entity
    treeStatusFilterRef: '', // association from context to a constrained entity
    // Note: the widget uses only the Status where the constrained set by treeStatusFilterRef matches
    //       the Constrained from treeStatusConstrainedRef in the Status
    
    treeContextEdgeSelectedRef: '', //associations to be set, when the user select an entry in the tree
    treeContextNodeSelectedRef: '', // 

    nodeHasChildrenAttribute: '', // attribute of <treeNode>, determines if node has children
    nodeTypeAttribute: '', // determines the primary icon to be shown for the node

    typeMapping: '', // mapping from type strings to icons and translated labels

    displayConfig: '', // configuration for which entries should be shown in the tree

    contextAttributeMapping: '', // defines attributes that are copied from the selected edge/node to the context

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
        callback: function() {
          this._refreshNodeTexts();
        }
      }, this);

      this.subscribe({
        guid: this._contextObj.getGuid(),
        attr: this.treeStatusFilterRef.split('/')[0],
        callback: function() {
          this._refreshNodeTexts();
        }
      }, this);

      this.displayConfig.forEach( function( cfg ){
        if ( cfg.displayFilter ) {
          this.subscribe({
            guid: this._contextObj.getGuid(),
            attr: cfg.displayFilter,
            callback: function() {
              this._refreshNodeTexts();
            }
          }, this);
        }
      }, this);

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
      if (update_callback) update_callback();
    },

    _copyObjectAttribute: function( objSrc, objDst, attributeSrc, attributeDst ) {
      var value = objDst.isBoolean( attributeDst ) ? false : null;
      if ( objSrc ) {
        value = objSrc.get( attributeSrc );
      }
      objDst.set( attributeDst, value );
    },

    _load_node_jstree: function( e, data ) {
      logger.debug(this.id + ".jstree.load_node");
      //console.log( '_load_node' );
      //this._updateSelectionFromContext();
    },

    // ----
    // this is the initial data source entry point when loading the children of a node
    // ----
    _treeDataSource: function (node, data_callback ) {
      logger.debug(this.id + "._treeDataSource");
      
      if ( node.id == '#' ) {
        // the root node is retrieved from the context
        var loadRoot = this._loadRootNode();

        // load status list from root
        var loadStatusList = loadRoot.then( function(nodeObj) {
          return this._loadStatus( nodeObj );
        }.bind(this));

        // build root node
        Promise.all( [loadRoot, loadStatusList] ).then( function( results ){
          var nodeObj = results[0];
          var statusList = results[1];          
          data_callback.call( this._jstree, [ this._buildNode(null, nodeObj, null, statusList) ] );
          this._subscribeRefresh( null, nodeObj, null, statusList );
        }.bind(this));

      } else {
        // other child nodes are retrieved via XPATH from the parent node
        var parentNodeObj = node.original.nodeObj;

        // Load all child node data (edges, nodes, status)
        Promise.all([
          this._loadChildEdges( parentNodeObj ),
          this._loadChildNodes( parentNodeObj ),
          this._loadChildStatus( parentNodeObj ),
          this._loadChildGroups( parentNodeObj )
        ]).then(function(arrayOfResults) {
          var edges = arrayOfResults[0];
          var nodes = arrayOfResults[1];
          var statusListAll = arrayOfResults[2];
          var groups = arrayOfResults[3];
          
          var newNodes = [];

          this._mapEdgesAndNodes( edges, nodes, groups, statusListAll, function( edgeObj, nodeObj, groupObj, statusList) {
            newNodes.push( this._buildNode( edgeObj, nodeObj, groupObj, statusList) );
            this._subscribeRefresh( edgeObj, nodeObj, groupObj, statusList );
          });

          data_callback.call( this, newNodes);
        }.bind(this) );
      }
    },

    // Call this function to reload the children of a node
    _reloadNode: function( parentNode ) {
      logger.debug(this.id + ".reloadNode[id:"+ parentNode.id + "][state: " + JSON.stringify(parentNode.state) + "]" );

      if ( ! parentNode.state.loaded ) {
        //this._jstree.load_node( node );
      } else {
        // load_node would simply do a hard reload (no clean refresh possible)
        // this._jstree.load_node( node );

        Promise.all([
          this._loadChildEdges( parentNode.original.nodeObj ),
          this._loadChildNodes( parentNode.original.nodeObj ),
          this._loadChildStatus( parentNode.original.nodeObj ),
          this._loadChildGroups( parentNode.original.nodeObj )
        ]).then(function(arrayOfResults) {
          var edges = arrayOfResults[0] || [];
          var nodes = arrayOfResults[1];
          var statusListAll = arrayOfResults[2];
          var groups = arrayOfResults[3];

          // fetch the old child nodes
          var childJsNodes = parentNode.children.map( function(childnodeId) { return this._jstree.get_node(childnodeId); }, this);
          var oldGuids = childJsNodes.map( function(childJsNode) { return childJsNode.original.edgeObj.getGuid(); }).sort();
          var newGuids = edges.map( function(ro) { return ro.getGuid(); }).sort();

          var newEdges = [];
          var deletedEdges = [];

          var i=0, j=0;
          while ( i<newGuids.length && j<oldGuids.length ) {
            if ( newGuids[i] == oldGuids[j] ) {
              i++; j++;
            } else if ( newGuids[i] < oldGuids[j] ) {
              newEdges.push( _.find( edges, function(obj) { return obj.getGuid() == newGuids[i];} ) );
              i++;
            } else {
              deletedEdges.push( oldGuids[j] );              
              j++;
            }
          }

          while ( i<newGuids.length ) {
            newEdges.push( _.find( edges, function(obj) { return obj.getGuid() == newGuids[i];} ) );
            i++;
          }

          while ( j<oldGuids.length ) {
            deletedEdges.push( oldGuids[j] )
            j++;
          }

          this._mapEdgesAndNodes( newEdges, nodes, groups, statusListAll, function( edgeObj, nodeObj, groupObj, statusList) {
            this._jstree.create_node( parentNode, this._buildNode( edgeObj, nodeObj, groupObj, statusList ) );
            this._subscribeRefresh( edgeObj, nodeObj, groupObj, statusList );
          });

          deletedEdges.forEach( function( guid ) {
            this._jstree.delete_node( '[edgeGuid='+guid+']' );
            this._unsubscribeObjectRefresh( guid );      
          }, this);

          // reorder nodes according to new order provided in DS MF
          /*
          reloadedObjs.forEach( function( obj, idx ) {
            this._jstree.move_node( '[objGuid=' + obj.getGuid() + ']', node, idx );
          }, this );
          */

        }.bind(this) );

      }
    },


    // iterate over edges, find matching node and statusList and call callback with matched data
    _mapEdgesAndNodes: function( edges, nodes, groups, statusListAll, callback ) {
      edges.forEach( function(edgeObj) {
        // find the child node for each edge
        var edgeChildGuid = edgeObj.get(this.treeEdgeChildRef.split('/')[0]);          
        
        // match nodes with edges
        var nodeObj = nodes.find( function(obj){
          return obj.getGuid() == edgeChildGuid;
        }, this);

        var groupObj = null;
        var statusList = []; 

        if ( nodeObj ) {
          var nodeGroupGuid = nodeObj.get(this.treeNodeGroupRef.split('/')[0]);          
          // match groups with nodes
          groupObj = groups.find( function(obj){
            return obj.getGuid() == nodeGroupGuid;
          }, this);

          // match statusList with edges
          statusList = statusListAll.filter( function(obj){
            return obj.get( this.treeStatusRef.split('/')[0] ) == edgeChildGuid;
          }, this);
        }

        callback.call(this, edgeObj, nodeObj, groupObj, statusList );
      }, this );
    },

    // this function handles selections in the tree
    _changed_jstree: function( e, data ) {
      logger.debug(this.id + ".jstree.changed");

      var event = data.event;

      if ( data.action == 'select_node' ) {
        var nodeObj = data.node.original.nodeObj;
        var edgeObj = data.node.original.edgeObj;

        if ( this._contextObj.isReadonlyAttr( this.treeContextEdgeSelectedRef.split('/')[0] ) ){
          logger.warn(this.treeContextEdgeSelectedRef.split('/')[0] + ' is read only!');
        } else {
          this._contextObj.set(
            this.treeContextEdgeSelectedRef.split('/')[0],
            edgeObj ? edgeObj.getGuid() : null
          );
        }

        if ( this._contextObj.isReadonlyAttr( this.treeContextNodeSelectedRef.split('/')[0] ) ){
          logger.warn(this.treeContextNodeSelectedRef.split('/')[0] + ' is read only!');
        } else {
          this._contextObj.set(
            this.treeContextNodeSelectedRef.split('/')[0],
            nodeObj ? nodeObj.getGuid() : null
          );
        }

        // copy all attributes defined in the mapping when selecting a node in the tree
        this.contextAttributeMapping.forEach( function( mapping ) {
          if ( this._contextObj.isReadonlyAttr( mapping.mapContextAttribute.split('/')[0] ) ){
            logger.warn( mapping.mapContextAttribute.split('/')[0] + ' is read only!');
          } else {
            if ( mapping.mapNodeAttribute ) {
              this._copyObjectAttribute( nodeObj, this._contextObj, mapping.mapNodeAttribute, mapping.mapContextAttribute);
            } else if ( mapping.mapEdgeAttribute ) {
              this._copyObjectAttribute( edgeObj, this._contextObj, mapping.mapEdgeAttribute, mapping.mapContextAttribute);
            }
          }
        }, this);

      } else if ( data.action == 'delete_node' ) {
        // do something on delete
      } else if ( data.action == 'ready' ){
        // do something when tree is ready
      }
    },
    
    // *** DATA LOADING ***
    // Methods for loading data from the server (returning a Promise)

    // load the root node from the context
    _loadRootNode: function() {
      return this._loadPath( this._contextObj.getGuid(), this.rootNodeRef.split('/')[0] ).then( function(objs){
        return objs[0];
      }.bind(this));
    },

    // retrieve all child edges of a node
    _loadChildEdges: function( parentNodeObj ) {
      var xpathConstraint = this.treeEdgeParentRef.split('/')[0] +
      '=' + parentNodeObj.getGuid() ;
      return this._loadXPath( this.treeEdge, xpathConstraint );
    },

    // retrieve all child nodes of a node
    _loadChildNodes: function( parentNodeObj ) {
      var xpathConstraint = this.treeEdgeChildRef.split('/')[0] +
      '/' + this.treeEdge +
      '/' + this.treeEdgeParentRef.split('/')[0] +
      '=' + parentNodeObj.getGuid() ;
      return this._loadXPath( this.treeNode, xpathConstraint );
    },

    // retrieve all status of all child nodes of a node
    _loadChildStatus: function( parentNodeObj ) {
      var xpathConstraint = this.treeStatusRef.split('/')[0] + 
      '/' + this.treeNode +
      '/' + this.treeEdgeChildRef.split('/')[0] +
      '/' + this.treeEdge +
      '/' + this.treeEdgeParentRef.split('/')[0] +
      '=' + parentNodeObj.getGuid() ;
      return this._loadXPath( this.treeStatus, xpathConstraint );
    },

    // retrieve all status of all child nodes of a node
    _loadChildGroups: function( parentNodeObj ) {
      var xpathConstraint = this.treeNodeGroupRef.split('/')[0] + 
      '/' + this.treeNode +
      '/' + this.treeEdgeChildRef.split('/')[0] +
      '/' + this.treeEdge +
      '/' + this.treeEdgeParentRef.split('/')[0] +
      '=' + parentNodeObj.getGuid() ;
      return this._loadXPath( this.treeNodeGroup, xpathConstraint );
    },
/*
    _loadGroup: function( nodeObj ) {
      return this._loadPath( nodeObj.getGuid(), this.treeNodeGroupRef.split('/')[0]).then( function(objs){
        return objs[0];
      }.bind(this));
    },
*/
    // retrieve all status of a node
    _loadStatus: function( nodeObj ) {
      var xpathConstraint = this.treeStatusRef.split('/')[0] + 
      '=' + nodeObj.getGuid() ;
      return this._loadXPath( this.treeStatus, xpathConstraint );
    },

    // *** DATA LOADING - GENERIC***
    // Generic Methods for loading data from the server (or from cache) (returning a Promise)

    // load an object by its GUID
    _loadGuid: function( guid ) {
      return new Promise( function( resolve,reject){
        mx.data.get({
          guid: guid,
          callback: function( obj ) {
            if (obj) {
              resolve( obj );
            } else {
              reject( 'object with guid not found: ' + guid );
            }
          },
          error: function( error ) {
            reject( error );
          }
        },this);
      }.bind(this));
    },

    // return a Promise for retrieving an entity with an xpathConstraint
    _loadXPath: function( entity, xpathConstraint ) {
      return new Promise( function(resolve, reject) {
        mx.data.get({
          // retrieve the child edges from the parent nodeObj
          xpath: '//'+entity+'['+xpathConstraint+']',
          callback: function( edges ) {
            resolve( edges );
          },
          error: function( error ) {
            reject( error );
          }
        }, this);
      }.bind(this));
    },
   
    // return a Promise for retrieving from an entity over a path
    _loadPath: function( guid, path ) {
      return new Promise( function(resolve,reject){
        mx.data.get({
          guid: guid,
          path: path,
          callback: function( objs ) {
            resolve( objs );
          },
          error: function( error ) {
            reject( error );
          }
        },this);
      }.bind(this));
    },


    // *** SUBSCRIPTIONS ***
    // 

    // Subscribe for changes in all objects that are attached to a jsTreeNode
    _subscribeRefresh: function( edgeObj, nodeObj, groupObj, statusList ) {
      if ( edgeObj ) {
        this._subscribeEdgeRefresh( edgeObj );            
      }
      if ( groupObj ) {
        this._subscribeGroupRefresh( groupObj );            
      }
      if ( nodeObj ) {
        this._subscribeNodeRefresh( nodeObj );
      }
      statusList.forEach( function(statusObj) {
        this.subscribeStatusRefresh( statusObj );
      }, this );
    },

    _subscribeNodeRefresh: function( nodeObj ) {
      this._subscribeObjectRefresh( nodeObj, function( guid ){
        this._loadGuid( guid).then( function(obj) {
          this._jsTreeNodes().filter( function(node) {
            return node.original && node.original.nodeObj && node.original.nodeObj.getGuid() == guid;
          }).forEach( function( node ) {
            node.original.nodeObj = obj;
            this._refreshNodeText( node );
            this._refreshNodeType( node );
            this._reloadNode( node );
          },this)
        }.bind(this))
      })
    },

    _subscribeGroupRefresh: function( groupObj ) {
      this._subscribeObjectRefresh( groupObj, function( guid ){
        this._loadGuid( guid).then( function(obj) {
          this._jsTreeNodes().filter( function(node) {
            return node.original && node.original.groupObj && node.original.groupObj.getGuid() == guid;
          }).forEach( function( node ) {
            node.original.groupObj = obj;
            this._refreshNodeText( node );
          },this)
        }.bind(this))
      })
    },

    _subscribeEdgeRefresh: function( edgeObj ) {
      this._subscribeObjectRefresh( edgeObj, function( guid ){
        this._loadGuid( guid).then( function(obj) {
          this._jsTreeNodes().filter( function(node) {
            return node.original && node.original.edgeObj && node.original.edgeObj.getGuid() == guid;
          }).forEach( function( node ) {
            node.original.edgeObj = obj;
            this._refreshNodeText( node );
          },this)
        }.bind(this))
      })
    },

    subscribeStatusRefresh: function( statusObj ) {
      this._subscribeObjectRefresh( statusObj, function( guid ){
        this._loadGuid( guid).then( function(obj) {
          var nodeGuid = obj.get( this.treeStatusRef.split('/')[0] );
          this._jsTreeNodes().filter( function(node) {
            return node.original && node.original.nodeObj && node.original.nodeObj.getGuid() == nodeGuid;
          }).forEach( function( node ) {
            node.original.statusList.forEach( function(status, i) {
              if ( status.getGuid() == guid ) {
                node.original.statusList[i] = obj;
              }
            });
            node.original.statusList.push( obj );
            this._refreshNodeText( node );
          },this)
        }.bind(this))
      })
    },

    _subscribeObjectRefresh: function( obj, callback ) {
      var guid = obj.getGuid();
      if ( this._handles[ guid ] ) {
        logger.debug(this.id + "._subscribeObjectRefresh - already subscribed : " + guid);
      } else {
        logger.debug(this.id + "._subscribeObjectRefresh - subscribe to : " + guid);
        this._handles[ guid ] = this.subscribe({
          guid: guid,
          callback: callback.bind(this),
        });
      }
    },

    _unsubscribeObjectRefresh: function( guid ) {
      var handle = this._handles[ guid ];
      if ( handle ) {
        this.unsubscribe( handle );
        this._handles[ guid ] = undefined;
      }
    },



    // recreate all node texts in the tree
    _refreshNodeTexts: function() {
      this._jsTreeNodes().forEach( function( node ) {
        if ( node.id != '#' ) {
          this._jstree.rename_node( node, this._buildNodeText( node.original.edgeObj, node.original.nodeObj, node.original.groupObj, node.original.statusList ) );
        }
      }, this );
    },

    _refreshNodeText: function( node ) {
      this._jstree.rename_node( node, this._buildNodeText( node.original.edgeObj, node.original.nodeObj, node.original.groupObj, node.original.statusList ) );
    },

    _refreshNodeType: function( node ) {
      this._jstree.set_type( node, node.original.nodeObj.get(this.nodeTypeAttribute) );
    },

    _jsTreeNodes: function() {
      var modelData = this._jstree._model.data;
      return Object.keys( modelData ).map( function( key ) { return modelData[key]; });
    },

    /*
    _updateSelectionFromContext: function() {
      logger.debug(this.id + ".updateselection");

      if ( this.selectionReference ) {
        var referenceGuid = this._contextObj.getReference( this.selectionReference.split('/')[0] );
        this._jstree.deselect_all( true );
        if ( referenceGuid ) {
          this._jstree.select_node( '[nodeGuid='+referenceGuid+']', true );
        }
      }
    },
    */

    // method for building the jsTree Node data object
    _buildNode: function( edgeObj, nodeObj, groupObj, statusList ) {
      var nodeConfig = {
        edgeObj: edgeObj,
        nodeObj: nodeObj,
        groupObj: groupObj,
        statusList: statusList,
//        id: obj.getGuid(),
        text: this._buildNodeText( edgeObj, nodeObj, groupObj, statusList ),
        children: (nodeObj && nodeObj.get( this.nodeHasChildrenAttribute )) ? true : [],
        state: {
          opened: false
        },
        li_attr: {
          nodeGuid: nodeObj && nodeObj.getGuid(),
          edgeGuid: edgeObj && edgeObj.getGuid()
        }
      };

      if ( this.nodeTypeAttribute ) {
        nodeConfig.type = nodeObj && nodeObj.get(this.nodeTypeAttribute);
      }
      return nodeConfig;
    },

    // compose the full node text entry with 
    _buildNodeText: function( edgeObj, nodeObj, groupObj, statusList ) {
      var text = [];
      // Only use the Status matching the current constraint for display
      var constraintGuid = this._contextObj.get( this.treeStatusFilterRef.split('/')[0]);      
      var statusObj = statusList.find( function(obj){
        return obj.get( this.treeStatusConstrainedRef.split('/')[0] ) == constraintGuid;
      }, this);

      this.displayConfig.forEach( function( cfg ){
        if ( cfg.displayFilter ) {
          if ( this._contextObj.get( cfg.displayFilter ) == false ) {
            return;
          }
        }

        var attributeValue = null;
        if ( cfg.displayNodeAttribute ) {
          if ( nodeObj ) {
            attributeValue = nodeObj.get( cfg.displayNodeAttribute );
          } else {
            return;
          }
        } else if ( cfg.displayEdgeAttribute ) {
          if ( edgeObj ) {
            attributeValue = edgeObj.get( cfg.displayEdgeAttribute );          
          } else {
            return;
          }
        } else if ( cfg.displayStatusAttribute ) {
          if ( statusObj ) {
            attributeValue = statusObj.get( cfg.displayStatusAttribute );
          } else {
            return;
          }
        } else if ( cfg.displayGroupAttribute ) {
          if ( groupObj ) {
            attributeValue = groupObj.get( cfg.displayGroupAttribute );
          } else {
            return;
          }
        }

        if ( cfg.displayMode == 'text' ) {
          text.push({
            text: attributeValue,
            class: cfg.displayCssClass
          });
        } else if ( cfg.displayMode == 'type' ) {
          var typeEntry = this._treeTypeMapping[ attributeValue ];
          if ( typeEntry ) {
            text.push(
              _.extend( {
                type: attributeValue,
                class: cfg.displayCssClass
              }, typeEntry)
            );
          } else {
            text.push( {
              text: '['+attributeValue+']'
            } );
          }  
        }
      },this);
      return text;
    },

    // mxui.widget._WidgetBase.uninitialize is called when the widget is destroyed. Implement to do special tear-down work.
    uninitialize: function () {
      logger.debug(this.id + ".uninitialize");
    },

  });
});

require(["MaterialTree/widget/MaterialTree"]);
