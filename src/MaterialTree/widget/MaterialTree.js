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

    displayAttribute: "", // attribute containing the text displayed in a node
    expandableAttribute: "", // determines if a node can be expanded (has children)

    mfOnChange: "", // microflow triggered when a node is selected

    typeAttribute: "", //
    typeMapping: "", //

    // Internal variables. Non-primitives created in the prototype are shared between all widget instances.
    _handles: null,
    _contextObj: null,

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

      var mxTree = this;

      var treeTypeMapping = {};
      mxTree.typeMapping.forEach( function( map ) {
        treeTypeMapping[ map.type ] = {
          'icon' : './'+map.icon
        };
      });

      console.log( treeTypeMapping );

      $(this.domNode).jstree({
        'core' : {
          'data' : function (node, data_callback ) {
            // this context is switched to the jsTree here
            if ( node.id == '#' ) {
              var dataMF = mxTree.mfRootData;
              var nodeObj = mxTree._contextObj;
            } else {
              var dataMF = mxTree.mfNodeData;
              var nodeObj = node.original.obj;
            }

            mx.ui.action( dataMF, {
              params: {
                applyto: "selection",
                guids: [ nodeObj.getGuid() ]
              },
              scope: mxTree.mxform,
              callback: function( objs ) {
                var newNodes = [];

                objs.forEach( function( obj ) {
                  newNodes.push({
                    text: obj.get(mxTree.displayAttribute),
                    children: obj.get(mxTree.expandableAttribute),
                    obj: obj,
                    type: obj.get(mxTree.typeAttribute),
                  });
                })

                data_callback.call( this, newNodes );
              }
            }, this );

          }
        },
        'types' : treeTypeMapping,
        'plugins' : [ 'types' ]
      }).on( 'changed.jstree', function( e, data ) {
        var nodeObj = data.node.original.obj;
        var event = data.event;
        if ( mxTree.mfOnChange ) {
          mx.ui.action( mxTree.mfOnChange, {
            params: {
              applyto: "selection",
              guids: [ nodeObj.getGuid() ]
            },
            scope: mxTree.mxform,
            callback: function() {
              // mf call ok
            }
          }, this );
        }
      } );

      //this._resetSubscriptions();
      mendix.lang.nullExec(update_callback);
    },

    // mxui.widget._WidgetBase.uninitialize is called when the widget is destroyed. Implement to do special tear-down work.
    uninitialize: function () {
      logger.debug(this.id + ".uninitialize");
      // Clean up listeners, helper objects, etc. There is no need to remove listeners added with this.connect / this.subscribe / this.own.
    },

    // Rerender the interface.
    _updateRendering: function () {
      logger.debug(this.id + "._updateRendering");
    },

  _unsubscribe: function () {
    if (this._handles) {
      dojoArray.forEach(this._handles, function (handle) {
        mx.data.unsubscribe(handle);
      });
      this._handles = [];
    }
  },

  // Reset subscriptions.
  _resetSubscriptions: function () {
    logger.debug(this.id + "._resetSubscriptions");
    // Release handles on previous object, if any.
    this._unsubscribe();

    // When a mendix object exists create subscribtions.
    if (this._contextObj) {
      var objectHandle = mx.data.subscribe({
        guid: this._contextObj.getGuid(),
        callback: dojoLang.hitch(this, function (guid) {
          this._updateRendering();
        })
      });
      this._handles = [ objectHandle ];
    }
  }
});
});

require(["MaterialTree/widget/MaterialTree"]);
