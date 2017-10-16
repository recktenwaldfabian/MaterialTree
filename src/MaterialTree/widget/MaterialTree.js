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
    nodeSortAttribute: '', // attribute to sort the nodes on

    typeMapping: '', // mapping from type strings to icons and translated labels

    displayConfig: '', // configuration for which entries should be shown in the tree

    contextAttributeMapping: '', // defines attributes that are copied from the selected edge/node to the context

    // Internal variables. Non-primitives created in the prototype are shared between all widget instances.
    _handles: null,
    _contextObj: null,
    _jstree: null,
    _treeTypeMapping: null,
    _statusFilterGuid: null,

    // This is function is needed for a quite useless requirement by Tec4U, i.e. show different type icons when a filter is on
    typePrefixFiltered: '',

    // dojo.declare.constructor is called to construct the widget instance. Implement to initialize non-primitive properties.
    constructor: function () {
      logger.debug(this.id + ".constructor");
      this._handles = [];
    },

    // dijit._WidgetBase.postCreate is called after constructing the widget. Implement to do extra setup work.
    postCreate: function () {
      logger.debug(this.id + ".postCreate");

      this.rootNodeRef_Name = this.rootNodeRef.split('/')[0];
      this.treeEdgeParentRef_Name = this.treeEdgeParentRef.split('/')[0];
      this.treeEdgeChildRef_Name = this.treeEdgeChildRef.split('/')[0];
      this.treeStatusRef_Name = this.treeStatusRef.split('/')[0];
      this.treeNodeGroupRef_Name = this.treeNodeGroupRef.split('/')[0];
      this.treeStatusConstrainedRef_Name = this.treeStatusConstrainedRef.split('/')[0];
      this.treeStatusFilterRef_Name = this.treeStatusFilterRef.split('/')[0];
      this.treeContextEdgeSelectedRef_Name = this.treeContextEdgeSelectedRef.split('/')[0];
      this.treeContextNodeSelectedRef_Name = this.treeContextNodeSelectedRef.split('/')[0];
     },

    // mxui.widget._WidgetBase.update is called when context is changed or initialized. Implement to re-render and / or fetch data.
    update: function (obj, update_callback) {
      logger.debug(this.id + ".update");

      if ( this._contextObj ) {
        if (obj) {
          if ( this._contextObj.getGuid() = obj.getGuid() ) {
            // nothing to be changed
            this._contextObj = obj;
          } else {
            this._jstree.destroy();
            unsubscribeAll();

            this._contextObj = obj;
            this._initializeJsTree();
          }
        } else {
          this._jstree.destroy();
          unsubscribeAll();
          this._contextObj = obj;
        }
      } else {
        if (obj) {
          this._contextObj = obj;
          this._initializeJsTree();
        } else {
          // nothing to do
        }
      }      
      if (update_callback) update_callback();
    },

    _initializeJsTree: function() {      
      this.subscribe({
        guid: this._contextObj.getGuid(),
        callback: function() {
          var newStatusFilterGuid = this._contextObj.get( this.treeStatusFilterRef_Name );          
          if ( this._statusFilterGuid != newStatusFilterGuid ) {
            this._statusFilterGuid = newStatusFilterGuid;
            this._statusFilter_changed( this._statusFilterGuid );
          } else {
            this._refreshNodeTexts();
          }
        }
      }, this);

      this.subscribe({
        guid: this._contextObj.getGuid(),
        attr: this.treeStatusFilterRef_Name,
        callback: function() {
          
          var newStatusFilterGuid = this._contextObj.get( this.treeStatusFilterRef_Name );          
          if ( this._statusFilterGuid != newStatusFilterGuid ) {
            this._statusFilterGuid = newStatusFilterGuid;
            this._statusFilter_changed( this._statusFilterGuid );
          }          
          
        }
      }, this);

      this.displayConfig.forEach( function( cfg ){
        if ( cfg.displayFilter ) {
          this.subscribe({
            guid: this._contextObj.getGuid(),
            attr: cfg.displayFilter,
            callback: function() {
              this._displayFilter_changed();
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
        'plugins' : [ 'types', 'sort' ],
        'sort' : function( a, b) {
          var nodeA = this._jstree.get_node( a );
          var nodeB = this._jstree.get_node( b );
          return nodeA.data.nodeObj.get( this.nodeSortAttribute ).localeCompare( nodeB.data.nodeObj.get( this.nodeSortAttribute ) );
        }.bind(this)

      }).on( 'changed.jstree', dojoLang.hitch( this, '_changed_jstree') )
      .on( 'load_node.jstree', dojoLang.hitch( this, '_load_node_jstree') );

      this._jstree = $(this.domNode).jstree(true);

      //this._resetSubscriptions();
    },

    _copyObjectAttribute: function( objSrc, objDst, attributeSrc, attributeDst ) {
      var value = objDst.isBoolean( attributeDst ) ? false : null;
      if ( objSrc ) {
        value = objSrc.get( attributeSrc );
      }
      objDst.set( attributeDst, value );
    },

    _setNodeLoading: function( node, loading ) {
      if ( loading ) {
        this._jstree.get_node( node, true).addClass("jstree-loading").attr('aria-busy',true);
      } else {
        this._jstree.get_node( node, true).removeClass("jstree-loading").attr('aria-busy',false);
      }
    },

    _load_node_jstree: function( e, data ) {
      logger.debug(this.id + ".jstree.load_node");
      //console.log( '_load_node' );
      //this._updateSelectionFromContext();
      if ( data && data.node && (data.node.id=='#') ) {
        data.node.children.forEach( function( childId ){
          var childNode = this._jstree.get_node( childId );
          this._jstree.select_node( childNode, true );
          this._selectNode( childNode );
        },this);
      }
    },

    // triggered when the reference to the status filter is changed
    _statusFilter_changed: function( filterGuid ) {
      if ( filterGuid ) {
        var rootNode = this._jstree.get_node('#');
        var topNode = this._jstree.get_node( rootNode.children[0] );
        
        topNode.state.loading = true;

        this._loadFilteredStatus( topNode.data.nodeObj, filterGuid ).then( function(statusObj) {
          topNode.data.statusObj = statusObj;
          this._refreshNodeText( topNode );
          this._refreshNodeType( topNode );
        }.bind(this));
  
        this._statusFilter_reloadNodeChildren( topNode, filterGuid );
      } else {
        this._refreshNodeTexts();
      }    
    },

    _statusFilter_reloadNodeChildren: function( parentNode, filterGuid ) {
      // get child nodes
      var childNodes = parentNode.children.map( function( child_id ) { return this._jstree.get_node( child_id ); }, this );

      if ( childNodes.length > 0 ) {
        this._setNodeLoading( parentNode, true );
        // fetch the status for all children of this node
        this._loadChildFilteredStatus( parentNode.data.nodeObj, filterGuid ).then( function(statusList) {
          childNodes.forEach( function( node ) {
            // find the status matching each node
            var nodeObjGuid = node.data.nodeObj.getGuid();              
            node.data.statusObj = statusList.find( function(obj){
              return obj.get( this.treeStatusRef_Name ) == nodeObjGuid;
            }, this);
            // refresh the node display
            this._refreshNodeText( node );
            this._refreshNodeType( node );
            this._setNodeLoading( node, false );
          },this);                   
          this._setNodeLoading( parentNode, false );          
        }.bind(this) );

        // apply reload to child nodes
        childNodes.forEach( function( node ) {
          this._statusFilter_reloadNodeChildren( node, filterGuid );
        },this);
      } else {
        this._setNodeLoading( parentNode, true );
      }
    },

    // triggered when one of the display filter flags is changed
    _displayFilter_changed: function() {
      this._refreshNodeTexts();      
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
        var loadRootStatus = loadRoot.then( function(nodeObj) {
          return this._loadFilteredStatus( nodeObj, this._contextObj.get( this.treeStatusFilterRef_Name ) );
        }.bind(this));

        // build root node
        Promise.all( [loadRoot, loadRootStatus] ).then( function( results ){
          var nodeObj = results[0];
          var statusObj = results[1];
          var nodeConfig = this._buildNode(null, nodeObj, null, statusObj);
          nodeConfig.state.opened = true; // open the root node by default         
          data_callback.call( this._jstree, [ nodeConfig ] );
          this._subscribeRefresh( null, nodeObj, null, statusObj );
        }.bind(this));

      } else {
        // other child nodes are retrieved via XPATH from the parent node
        var parentNodeObj = node.data.nodeObj;

        // Load all child node data (edges, nodes, status)
        Promise.all([
          this._loadChildEdges( parentNodeObj ),
          this._loadChildNodes( parentNodeObj ),
          this._loadChildFilteredStatus( parentNodeObj, this._contextObj.get( this.treeStatusFilterRef_Name ) ),
          this._loadChildGroups( parentNodeObj )
        ]).then(function(arrayOfResults) {
          var edges = arrayOfResults[0];
          var nodes = arrayOfResults[1];
          var statusList = arrayOfResults[2];
          var groups = arrayOfResults[3];
          
          var newNodes = [];

          this._mapEdgesAndNodes( edges, nodes, groups, statusList, function( edgeObj, nodeObj, groupObj, statusObj) {
            newNodes.push( this._buildNode( edgeObj, nodeObj, groupObj, statusObj) );
            this._subscribeRefresh( edgeObj, nodeObj, groupObj, statusObj );
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
          this._loadChildEdges( parentNode.data.nodeObj ),
          this._loadChildNodes( parentNode.data.nodeObj ),
          this._loadChildFilteredStatus( parentNode.data.nodeObj, this._contextObj.get( this.treeStatusFilterRef_Name ) ),
          this._loadChildGroups( parentNode.data.nodeObj )
        ]).then(function(arrayOfResults) {
          var edges = arrayOfResults[0] || [];
          var nodes = arrayOfResults[1];
          var statusList = arrayOfResults[2];
          var groups = arrayOfResults[3];

          // fetch the old child nodes
          var childJsNodes = parentNode.children.map( function(childnodeId) { return this._jstree.get_node(childnodeId); }, this);
          var oldGuids = childJsNodes.map( function(childJsNode) { return childJsNode.data.edgeObj.getGuid(); }).sort();
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

          this._mapEdgesAndNodes( newEdges, nodes, groups, statusList, function( edgeObj, nodeObj, groupObj, statusObj) {
            this._jstree.create_node( parentNode, this._buildNode( edgeObj, nodeObj, groupObj, statusObj ) );
            this._subscribeRefresh( edgeObj, nodeObj, groupObj, statusObj );
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
    _mapEdgesAndNodes: function( edges, nodes, groups, statusList, callback ) {
      edges.forEach( function(edgeObj) {
        // find the child node for each edge
        var edgeChildGuid = edgeObj.get(this.treeEdgeChildRef_Name);          
        
        // match nodes with edges
        var nodeObj = nodes.find( function(obj){
          return obj.getGuid() == edgeChildGuid;
        }, this);

        var statusObj = statusList.find( function(obj){
          return obj.get( this.treeStatusRef_Name ) == edgeChildGuid;
        }, this);

        var groupObj = null;

        if ( nodeObj ) {
          var nodeGroupGuid = nodeObj.get(this.treeNodeGroupRef_Name);          
          // match groups with nodes
          groupObj = groups.find( function(obj){
            return obj.getGuid() == nodeGroupGuid;
          }, this);
        }

        callback.call(this, edgeObj, nodeObj, groupObj, statusObj );
      }, this );
    },

    // this function handles selections in the tree
    _changed_jstree: function( e, data ) {
      logger.debug(this.id + ".jstree.changed");

      var event = data.event;

      if ( data.action == 'select_node' ) {
        this._selectNode( data.node );
      } else if ( data.action == 'delete_node' ) {
        // do something on delete
      } else if ( data.action == 'ready' ){
        // do something when tree is ready
      }
    },

    _selectNode: function( node ) {
      var nodeObj = node.data.nodeObj;
      var edgeObj = node.data.edgeObj;

      if ( this._contextObj.isReadonlyAttr( this.treeContextEdgeSelectedRef_Name ) ){
        logger.warn(this.treeContextEdgeSelectedRef_Name + ' is read only!');
      } else {
        this._contextObj.set(
          this.treeContextEdgeSelectedRef_Name,
          edgeObj ? edgeObj.getGuid() : null
        );
      }

      if ( this._contextObj.isReadonlyAttr( this.treeContextNodeSelectedRef_Name ) ){
        logger.warn(this.treeContextNodeSelectedRef_Name + ' is read only!');
      } else {
        this._contextObj.set(
          this.treeContextNodeSelectedRef_Name,
          nodeObj ? nodeObj.getGuid() : null
        );
      }

      // copy all attributes defined in the mapping when selecting a node in the tree
      this.contextAttributeMapping.forEach( function( mapping ) {
        if ( this._contextObj.isReadonlyAttr( mapping.mapContextAttribute ) ){
          logger.warn( mapping.mapContextAttribute + ' is read only!');
        } else {
          if ( mapping.mapNodeAttribute ) {
            this._copyObjectAttribute( nodeObj, this._contextObj, mapping.mapNodeAttribute, mapping.mapContextAttribute);
          } else if ( mapping.mapEdgeAttribute ) {
            this._copyObjectAttribute( edgeObj, this._contextObj, mapping.mapEdgeAttribute, mapping.mapContextAttribute);
          }
        }
      }, this);
  },
    
    // *** DATA LOADING ***
    // Methods for loading data from the server (returning a Promise)

    // load the root node from the context
    _loadRootNode: function() {
      return this._loadPath( this._contextObj.getGuid(), this.rootNodeRef_Name ).then( function(objs){
        return objs[0];
      }.bind(this));
    },

    // retrieve all child edges of a node
    _loadChildEdges: function( parentNodeObj ) {
      var xpathConstraint = this.treeEdgeParentRef_Name +
      '=' + parentNodeObj.getGuid() ;
      return this._loadXPath( this.treeEdge, xpathConstraint );
    },

    // retrieve all child nodes of a node
    _loadChildNodes: function( parentNodeObj ) {
      var xpathConstraint = this.treeEdgeChildRef_Name +
      '/' + this.treeEdge +
      '/' + this.treeEdgeParentRef_Name +
      '=' + parentNodeObj.getGuid() ;
      return this._loadXPath( this.treeNode, xpathConstraint );
    },

    // retrieve all status of all child nodes of a node
    _loadChildStatus: function( parentNodeObj ) {
      var xpathConstraint = this.treeStatusRef_Name + 
      '/' + this.treeNode +
      '/' + this.treeEdgeChildRef_Name +
      '/' + this.treeEdge +
      '/' + this.treeEdgeParentRef_Name +
      '=' + parentNodeObj.getGuid() ;
      return this._loadXPath( this.treeStatus, xpathConstraint );
    },

    // retrieve all status of all child nodes of a node
    _loadChildFilteredStatus: function( parentNodeObj, filterGuid ) {
      if ( filterGuid ) {
        var xpathConstraint = this.treeStatusRef_Name + 
        '/' + this.treeNode +
        '/' + this.treeEdgeChildRef_Name +
        '/' + this.treeEdge +
        '/' + this.treeEdgeParentRef_Name +
        '=' + parentNodeObj.getGuid() +
        ' and ' + this.treeStatusConstrainedRef_Name +
        '=' + filterGuid;
        return this._loadXPath( this.treeStatus, xpathConstraint );
      } else {
        return Promise.resolve( [] );
      }
    },

    // retrieve all status of all child nodes of a node
    _loadChildGroups: function( parentNodeObj ) {
      var xpathConstraint = this.treeNodeGroupRef_Name + 
      '/' + this.treeNode +
      '/' + this.treeEdgeChildRef_Name +
      '/' + this.treeEdge +
      '/' + this.treeEdgeParentRef_Name +
      '=' + parentNodeObj.getGuid() ;
      return this._loadXPath( this.treeNodeGroup, xpathConstraint );
    },
/*
    _loadGroup: function( nodeObj ) {
      return this._loadPath( nodeObj.getGuid(), this.treeNodeGroupRef_Name).then( function(objs){
        return objs[0];
      }.bind(this));
    },
*/
    // retrieve all status of a node
    _loadStatus: function( nodeObj ) {
      var xpathConstraint = this.treeStatusRef_Name + 
      '=' + nodeObj.getGuid() ;
      return this._loadXPath( this.treeStatus, xpathConstraint );
    },

    // retrieve only the status matching a given filter
    _loadFilteredStatus: function( nodeObj, filterGuid ) {
      if ( filterGuid ) {        
        var xpathConstraint = this.treeStatusRef_Name + 
        '=' + nodeObj.getGuid() +
        ' and ' + this.treeStatusConstrainedRef_Name +
        '=' + filterGuid;
        return this._loadXPath( this.treeStatus, xpathConstraint ).then( function(objs){
          return objs[0];
        }.bind(this));   
      } else {
        return Promise.resolve( null );
      }
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
    _subscribeRefresh: function( edgeObj, nodeObj, groupObj, statusObj ) {
      if ( edgeObj ) {
        this._subscribeEdgeRefresh( edgeObj );            
      }
      if ( groupObj ) {
        this._subscribeGroupRefresh( groupObj );            
      }
      if ( nodeObj ) {
        this._subscribeNodeRefresh( nodeObj );
      }
      if ( statusObj ) {
        this.subscribeStatusRefresh( statusObj );
      }
    },

    _subscribeNodeRefresh: function( nodeObj ) {
      this._subscribeObjectRefresh( nodeObj, function( guid ){
        this._loadGuid( guid).then( function(obj) {
          this._jsTreeNodes().filter( function(node) {
            return node.original && node.data.nodeObj && node.data.nodeObj.getGuid() == guid;
          }).forEach( function( node ) {
            node.data.nodeObj = obj;
            node.data.nodeObjGuid = obj.getGuid();
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
            return node.original && node.data.groupObj && node.data.groupObj.getGuid() == guid;
          }).forEach( function( node ) {
            node.data.groupObj = obj;
            this._refreshNodeText( node );
          },this)
        }.bind(this))
      })
    },

    _subscribeEdgeRefresh: function( edgeObj ) {
      this._subscribeObjectRefresh( edgeObj, function( guid ){
        this._loadGuid( guid).then( function(newEdgeObj) {
          var newChildNodeGuid = newEdgeObj.get( this.treeEdgeChildRef_Name );
          this._jsTreeNodes().filter( function(node) {
            return node.original && node.data.edgeObj && node.data.edgeObj.getGuid() == guid;
          }).forEach( function( node ) {
            if ( node.data.nodeObjGuid == newChildNodeGuid) {
              node.data.edgeObj = newEdgeObj;
              node.data.edgeObjGuid = newEdgeObj.getGuid();                
              this._refreshNodeText( node );
            } else {
              this._loadGuid( newChildNodeGuid ).then( function(newNodeObj){
                node.data.edgeObj = newEdgeObj;
                node.data.edgeObjGuid = newEdgeObj.getGuid();                
                node.data.nodeObj = newNodeObj;
                node.data.nodeObjGuid = newNodeObj.getGuid();                
                this._refreshNodeText( node );
                this._refreshNodeType( node );
                this._reloadNode( node );
                if ( this._jstree.is_selected( node ) ) {
                  this._selectNode( node );
                }
              }.bind(this));
            }
          },this)
        }.bind(this))
      })
    },

    subscribeStatusRefresh: function( statusObj ) {
      this._subscribeObjectRefresh( statusObj, function( guid ){
        this._loadGuid( guid).then( function(obj) {
          var nodeGuid = obj.get( this.treeStatusRef_Name );
          this._jsTreeNodes().filter( function(node) {
            return node.original && node.data.nodeObj && node.data.nodeObj.getGuid() == nodeGuid;
          }).forEach( function( node ) {
            node.data.statusList.forEach( function(status, i) {
              if ( status.getGuid() == guid ) {
                node.data.statusList[i] = obj;
              }
            });
            node.data.statusList.push( obj );
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
          this._refreshNodeText( node );
          this._refreshNodeType( node );
          this._jstree.rename_node( node, this._buildNodeText( node.data.edgeObj, node.data.nodeObj, node.data.groupObj, node.data.statusObj ) );
        }
      }, this );
    },

    _refreshNodeText: function( node ) {
      this._jstree.rename_node( node, this._buildNodeText( node.data.edgeObj, node.data.nodeObj, node.data.groupObj, node.data.statusObj ) );
    },

    _refreshNodeType: function( node ) {
      this._jstree.set_type( node, this._getNodeObjType( node.data.nodeObj ) );
    },

    _getNodeObjType: function( nodeObj ) {
      if ( this.nodeTypeAttribute ) {   
        var nodeType = nodeObj.get(this.nodeTypeAttribute);
        if ( this.typePrefixFiltered && this._contextObj.get( this.treeStatusFilterRef_Name) ) {
          var nodeTypePrefixed = this.typePrefixFiltered + nodeType;
          if ( this._treeTypeMapping[ nodeTypePrefixed ] ) {
            return nodeTypePrefixed;
          }
        } 
        return nodeType;
      }
      return null;
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
    _buildNode: function( edgeObj, nodeObj, groupObj, statusObj ) {
      var nodeConfig = {
        data: {
          edgeObj: edgeObj,
          nodeObj: nodeObj,
          groupObj: groupObj,
          edgeObjGuid: edgeObj && edgeObj.getGuid(),
          nodeObjGuid: nodeObj && nodeObj.getGuid(),
          statusObj: statusObj
        },

//        id: obj.getGuid(),
        text: this._buildNodeText( edgeObj, nodeObj, groupObj, statusObj ),
        children: (nodeObj && nodeObj.get( this.nodeHasChildrenAttribute )) ? true : [],
        state: {
          opened: false
        },
        li_attr: {
          nodeGuid: nodeObj && nodeObj.getGuid(),
          edgeGuid: edgeObj && edgeObj.getGuid()
        }
      };

      if ( nodeObj) {
        nodeConfig.type = this._getNodeObjType( nodeObj );
      }
      return nodeConfig;
    },

    // compose the full node text entry with 
    _buildNodeText: function( edgeObj, nodeObj, groupObj, statusObj ) {
      var text = [];
      // Only use the Status matching the current constraint for display
      var constraintGuid = this._contextObj.get( this.treeStatusFilterRef_Name);      

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
          if ( statusObj && this._statusFilterGuid ) {
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

        if ( attributeValue != null && attributeValue != '') {
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
