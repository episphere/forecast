!function(t){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=t();else if("function"==typeof define&&define.amd)define([],t);else{("undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this).gaussian=t()}}(function(){return function(){return function t(n,e,r){function i(o,u){if(!e[o]){if(!n[o]){var f="function"==typeof require&&require;if(!u&&f)return f(o,!0);if(a)return a(o,!0);var s=new Error("Cannot find module '"+o+"'");throw s.code="MODULE_NOT_FOUND",s}var c=e[o]={exports:{}};n[o][0].call(c.exports,function(t){return i(n[o][1][t]||t)},c,c.exports,t,n,e,r)}return e[o].exports}for(var a="function"==typeof require&&require,o=0;o<r.length;o++)i(r[o]);return i}}()({1:[function(t,n,e){!function(t){const n=2*Math.PI;t(function(t,e){var r=Math.random(),i=Math.random(),a=Math.sqrt(-2*Math.log(r))*Math.cos(n*i);return Math.sqrt(-2*Math.log(r)),Math.sin(n*i),a*e+t})}(void 0!==e?function(t){n.exports=t}:function(t){this.boxmuller=t})},{}],2:[function(t,n,e){!function(n){const e=t("./box-muller");var r=function(t){var n=Math.abs(t),e=1/(1+n/2),r=e*Math.exp(-n*n-1.26551223+e*(1.00002368+e*(.37409196+e*(.09678418+e*(e*(.27886807+e*(e*(1.48851587+e*(.17087277*e-.82215223))-1.13520398))-.18628806)))));return t>=0?r:2-r},i=function(t,n){if(n<=0)throw new Error("Variance must be > 0 (but was "+n+")");this.mean=t,this.variance=n,this.standardDeviation=Math.sqrt(n)};i.prototype.pdf=function(t){var n=this.standardDeviation*Math.sqrt(2*Math.PI);return Math.exp(-Math.pow(t-this.mean,2)/(2*this.variance))/n},i.prototype.cdf=function(t){return.5*r(-(t-this.mean)/(this.standardDeviation*Math.sqrt(2)))},i.prototype.ppf=function(t){return this.mean-this.standardDeviation*Math.sqrt(2)*function(t){if(t>=2)return-100;if(t<=0)return 100;for(var n=t<1?t:2-t,e=Math.sqrt(-2*Math.log(n/2)),i=-.70711*((2.30753+.27061*e)/(1+e*(.99229+.04481*e))-e),a=0;a<2;a++){var o=r(i)-n;i+=o/(1.1283791670955126*Math.exp(-i*i)-i*o)}return t<1?i:-i}(2*t)},i.prototype.mul=function(t){if("number"==typeof t)return this.scale(t);var n=1/this.variance,e=1/t.variance;return o(n+e,n*this.mean+e*t.mean)},i.prototype.div=function(t){if("number"==typeof t)return this.scale(1/t);var n=1/this.variance,e=1/t.variance;return o(n-e,n*this.mean-e*t.mean)},i.prototype.add=function(t){return a(this.mean+t.mean,this.variance+t.variance)},i.prototype.sub=function(t){return a(this.mean-t.mean,this.variance+t.variance)},i.prototype.scale=function(t){return a(this.mean*t,this.variance*t*t)},i.prototype.random=function(t){let n=this.mean,r=this.standardDeviation;return Array(t).fill(0).map(()=>e(n,r))};var a=function(t,n){return new i(t,n)},o=function(t,n){return a(n/t,1/t)};n(a)}(void 0!==e?function(t){n.exports=t}:function(t){this.gaussian=t})},{"./box-muller":1}]},{},[2])(2)});