// Replacement for webpack/hot/emitter.js used in our dev-server bundle.
// Avoids `require("events")` (which fails to transform in some local toolchains, producing
// "ReferenceError: require is not defined" at runtime in the browser).
// Implements the minimal EventEmitter surface webpack-dev-server's client uses.
"use strict";

function Emitter() {
  this._l = Object.create(null);
}
Emitter.prototype.on = function (event, fn) {
  (this._l[event] = this._l[event] || []).push(fn);
  return this;
};
Emitter.prototype.off = function (event, fn) {
  var arr = this._l[event];
  if (!arr) return this;
  this._l[event] = arr.filter(function (f) { return f !== fn; });
  return this;
};
Emitter.prototype.removeListener = Emitter.prototype.off;
Emitter.prototype.addListener = Emitter.prototype.on;
Emitter.prototype.once = function (event, fn) {
  var self = this;
  function wrap() { self.off(event, wrap); fn.apply(null, arguments); }
  return this.on(event, wrap);
};
Emitter.prototype.emit = function (event /*, ...args */) {
  var args = Array.prototype.slice.call(arguments, 1);
  var arr = this._l[event];
  if (!arr) return false;
  arr.slice().forEach(function (fn) { fn.apply(null, args); });
  return true;
};

module.exports = new Emitter();
