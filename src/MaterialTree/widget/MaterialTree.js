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
  "dojo/text!MaterialTree/widget/template/MaterialTree.html"
], function (declare, _WidgetBase, _TemplatedMixin, dom, dojoDom, dojoProp, dojoGeometry, dojoClass, dojoStyle, dojoConstruct, dojoArray, dojoLang, dojoText, dojoHtml, dojoEvent, dojoOn, _jQuery, widgetTemplate) {
  "use strict";

  var $ = _jQuery.noConflict(true);

  // Declare widget's prototype.
  return declare("MaterialTree.widget.MaterialTree", [ _WidgetBase, _TemplatedMixin ], {
    // _TemplatedMixin will create our dom node using this HTML template.
    templateString: widgetTemplate,

    // DOM elements
    rootLiNode: null,

    // Parameters configured in the Modeler.
    mfRootData: "",
    mfNodeData: "",
    displayAttribute: "",
    expandableAttribute: "",

    // Internal variables. Non-primitives created in the prototype are shared between all widget instances.
    _handles: null,
    _contextObj: null,
    _rootNode: { subNodes: [] },

    // dojo.declare.constructor is called to construct the widget instance. Implement to initialize non-primitive properties.
    constructor: function () {
      logger.debug(this.id + ".constructor");
      this._handles = [];
    },

    // dijit._WidgetBase.postCreate is called after constructing the widget. Implement to do extra setup work.
    postCreate: function () {
      logger.debug(this.id + ".postCreate");

      this._rootNode.domNodeList = this.rootLiNode;

      this._updateRendering();
    },

    // mxui.widget._WidgetBase.update is called when context is changed or initialized. Implement to re-render and / or fetch data.
    update: function (obj, callback) {
      logger.debug(this.id + ".update");

      this._contextObj = obj;
      this._rootNode.obj = obj;

      // If a microflow has been set execute the microflow on a click.
      this._fetchNodeData( this._rootNode, this.mfRootData );

      this._resetSubscriptions();
      this._updateRendering(callback); // We're passing the callback to updateRendering to be called after DOM-manipulation
    },

    _fetchNodeData: function( node, mfSource ) {
      mx.ui.action( mfSource, {
        params: {
          applyto: "selection",
          guids: [ node.obj.getGuid() ]
        },
        scope: this.mxform,
        callback: function( objs ) {
          node.subNodes = [];

          objs.forEach( function( obj ) {
            node.subNodes.push( { obj: obj, rootNode: node })
          }, this)

          this._updateRendering();
        }
      }, this );
    },

    // mxui.widget._WidgetBase.uninitialize is called when the widget is destroyed. Implement to do special tear-down work.
    uninitialize: function () {
      logger.debug(this.id + ".uninitialize");
      // Clean up listeners, helper objects, etc. There is no need to remove listeners added with this.connect / this.subscribe / this.own.
    },

    // Rerender the interface.
    _updateRendering: function (callback) {
      logger.debug(this.id + "._updateRendering");

      dojoConstruct.empty( this.rootLiNode );

      this._rootNode.subNodes.forEach( this._renderNode, this );

      // The callback, coming from update, needs to be executed, to let the page know it finished rendering
      mendix.lang.nullExec(callback);
    },

    _renderNode: function( node ) {
      var expandable = node.obj.get( this.expandableAttribute );

      node.domNode = dojoConstruct.place('<li>' + node.obj.get( this.displayAttribute ) + '</li>', node.rootNode.domNodeList)

      if ( expandable ) {
        if ( node.subNodes ) {
          dojoClass.add( node.domNode, 'material-tree-expanded' );

          node.domNodeList = dojoConstruct.place('<ul></ul>', node.domNode);
          node.subNodes.forEach( this._renderNode, this );
        } else {
          dojoClass.add( node.domNode, 'material-tree-expandable' );
        }
      }

      dojoOn(node.domNode, "click",
      dojo.hitch( this, function( ev ) {
        dojoEvent.stop( ev );
        if ( expandable ) {
          if ( node.domNodeList ) {
            node.subNodes = undefined;
            node.domNodeList = undefined;
            this._updateRendering();
          } else {
            this._fetchNodeData( node, this.mfNodeData );
          }
        }
      })
    );

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
      /*
      var attrHandle = mx.data.subscribe({
      guid: this._contextObj.getGuid(),
      attr: this.displayA,
      callback: dojoLang.hitch(this, function (guid, attr, attrValue) {
      this._updateRendering();
    })
  });
  */
  this._handles = [ objectHandle ];
}
}
});
});

require(["MaterialTree/widget/MaterialTree"]);
