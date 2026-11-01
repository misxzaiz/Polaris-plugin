#! /usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/cross-argv/index.js
var require_cross_argv = __commonJS({
  "node_modules/cross-argv/index.js"(exports2, module2) {
    var IS_WINDOWS = process.platform === "win32";
    module2.exports = crossArgv2;
    function crossArgv2(pargv, force) {
      if (!pargv) pargv = process.argv;
      const str = pargv.join(` `);
      if ((!IS_WINDOWS || (str.match(/'/g) || []).length < 2) && !force) return pargv;
      const newStr = str.replace(/'(.+?)'/g, `"$1"`);
      return splitCommandLine(newStr);
    }
    function splitCommandLine(commandLine) {
      var doubleDoubleQuote = "<DDQ>";
      while (commandLine.indexOf(doubleDoubleQuote) > -1) doubleDoubleQuote += "@";
      var noDoubleDoubleQuotes = commandLine.replace(/""/g, doubleDoubleQuote);
      var spaceMarker = "<SP>";
      while (commandLine.indexOf(spaceMarker) > -1) spaceMarker += "@";
      var noSpacesInQuotes = noDoubleDoubleQuotes.replace(/"([^"]*)"?/g, (fullMatch, capture) => {
        return capture.replace(/ /g, spaceMarker).replace(RegExp(doubleDoubleQuote, "g"), '"');
      });
      var mangledParamArray = noSpacesInQuotes.split(/ +/);
      var paramArray = mangledParamArray.map((mangledParam) => {
        return mangledParam.replace(RegExp(spaceMarker, "g"), " ").replace(RegExp(doubleDoubleQuote, "g"), "");
      });
      return paramArray;
    }
  }
});

// node_modules/manage-path/dist/get-path-var.js
var require_get_path_var = __commonJS({
  "node_modules/manage-path/dist/get-path-var.js"(exports2, module2) {
    "use strict";
    module2.exports = getPathVar;
    var PATH_REGEX = /^PATH$/i;
    function getPathVar(env, platform) {
      var PATH = "PATH";
      if (platform === "win32") {
        PATH = "Path";
        Object.keys(env).some(function(e) {
          var matches = PATH_REGEX.test(e);
          if (matches) {
            PATH = e;
          }
          return matches;
        });
      }
      return PATH;
    }
  }
});

// node_modules/manage-path/dist/get-separator.js
var require_get_separator = __commonJS({
  "node_modules/manage-path/dist/get-separator.js"(exports2, module2) {
    "use strict";
    module2.exports = getSeparator;
    function getSeparator(platform) {
      return platform === "win32" ? ";" : ":";
    }
  }
});

// node_modules/manage-path/dist/index.js
var require_dist = __commonJS({
  "node_modules/manage-path/dist/index.js"(exports2, module2) {
    "use strict";
    var getPathVar = require_get_path_var();
    var getSeparator = require_get_separator();
    module2.exports = managePath2;
    function managePath2() {
      var env = arguments.length <= 0 || arguments[0] === void 0 ? {} : arguments[0];
      var _ref = arguments.length <= 1 || arguments[1] === void 0 ? { platform: process.platform } : arguments[1];
      var _ref$platform = _ref.platform;
      var platform = _ref$platform === void 0 ? process.platform : _ref$platform;
      var pathVar = getPathVar(env, platform);
      var separator = getSeparator(platform);
      var originalPath = env[pathVar];
      return { push, unshift, get, restore };
      function push() {
        for (var _len = arguments.length, paths = Array(_len), _key = 0; _key < _len; _key++) {
          paths[_key] = arguments[_key];
        }
        return change(true, paths);
      }
      function unshift() {
        for (var _len2 = arguments.length, paths = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
          paths[_key2] = arguments[_key2];
        }
        return change(false, paths);
      }
      function get() {
        return env[pathVar];
      }
      function restore() {
        env[pathVar] = originalPath;
        return get();
      }
      function change(append, paths) {
        if (!append) {
          paths = paths.reverse();
        }
        paths.forEach(function(path2) {
          var pathArray = getPathArray(path2);
          addExistingPath(pathArray, env[pathVar], append);
          env[pathVar] = pathArray.join(separator);
        });
        return get();
      }
    }
    function getPathArray(pathToAdd) {
      if (Array.isArray(pathToAdd)) {
        return pathToAdd;
      } else {
        return [pathToAdd];
      }
    }
    function addExistingPath(array, path2, appendMode) {
      if (!path2) {
        return;
      }
      if (appendMode) {
        array.unshift(path2);
      } else {
        array.push(path2);
      }
    }
  }
});

// node_modules/has-async-hooks/index.js
var require_has_async_hooks = __commonJS({
  "node_modules/has-async-hooks/index.js"(exports2, module2) {
    module2.exports = function() {
      try {
        return typeof require("async_hooks").createHook === "function";
      } catch (err) {
        return false;
      }
    };
  }
});

// node_modules/minimist/index.js
var require_minimist = __commonJS({
  "node_modules/minimist/index.js"(exports2, module2) {
    "use strict";
    function hasKey(obj, keys) {
      var o = obj;
      keys.slice(0, -1).forEach(function(key2) {
        o = o[key2] || {};
      });
      var key = keys[keys.length - 1];
      return key in o;
    }
    function isNumber(x) {
      if (typeof x === "number") {
        return true;
      }
      if (/^0x[0-9a-f]+$/i.test(x)) {
        return true;
      }
      return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(e[-+]?\d+)?$/.test(x);
    }
    function isConstructorOrProto(obj, key) {
      return key === "constructor" && typeof obj[key] === "function" || key === "__proto__";
    }
    module2.exports = function(args, opts) {
      if (!opts) {
        opts = {};
      }
      var flags = {
        bools: {},
        strings: {},
        unknownFn: null
      };
      if (typeof opts.unknown === "function") {
        flags.unknownFn = opts.unknown;
      }
      if (typeof opts.boolean === "boolean" && opts.boolean) {
        flags.allBools = true;
      } else {
        [].concat(opts.boolean).filter(Boolean).forEach(function(key2) {
          flags.bools[key2] = true;
        });
      }
      var aliases = {};
      function aliasIsBoolean(key2) {
        return aliases[key2].some(function(x) {
          return flags.bools[x];
        });
      }
      Object.keys(opts.alias || {}).forEach(function(key2) {
        aliases[key2] = [].concat(opts.alias[key2]);
        aliases[key2].forEach(function(x) {
          aliases[x] = [key2].concat(aliases[key2].filter(function(y) {
            return x !== y;
          }));
        });
      });
      [].concat(opts.string).filter(Boolean).forEach(function(key2) {
        flags.strings[key2] = true;
        if (aliases[key2]) {
          [].concat(aliases[key2]).forEach(function(k) {
            flags.strings[k] = true;
          });
        }
      });
      var defaults2 = opts.default || {};
      var argv = { _: [] };
      function argDefined(key2, arg2) {
        return flags.allBools && /^--[^=]+$/.test(arg2) || flags.strings[key2] || flags.bools[key2] || aliases[key2];
      }
      function setKey(obj, keys, value2) {
        var o = obj;
        for (var i2 = 0; i2 < keys.length - 1; i2++) {
          var key2 = keys[i2];
          if (isConstructorOrProto(o, key2)) {
            return;
          }
          if (o[key2] === void 0) {
            o[key2] = {};
          }
          if (o[key2] === Object.prototype || o[key2] === Number.prototype || o[key2] === String.prototype) {
            o[key2] = {};
          }
          if (o[key2] === Array.prototype) {
            o[key2] = [];
          }
          o = o[key2];
        }
        var lastKey = keys[keys.length - 1];
        if (isConstructorOrProto(o, lastKey)) {
          return;
        }
        if (o === Object.prototype || o === Number.prototype || o === String.prototype) {
          o = {};
        }
        if (o === Array.prototype) {
          o = [];
        }
        if (o[lastKey] === void 0 || flags.bools[lastKey] || typeof o[lastKey] === "boolean") {
          o[lastKey] = value2;
        } else if (Array.isArray(o[lastKey])) {
          o[lastKey].push(value2);
        } else {
          o[lastKey] = [o[lastKey], value2];
        }
      }
      function setArg(key2, val, arg2) {
        if (arg2 && flags.unknownFn && !argDefined(key2, arg2)) {
          if (flags.unknownFn(arg2) === false) {
            return;
          }
        }
        var value2 = !flags.strings[key2] && isNumber(val) ? Number(val) : val;
        setKey(argv, key2.split("."), value2);
        (aliases[key2] || []).forEach(function(x) {
          setKey(argv, x.split("."), value2);
        });
      }
      Object.keys(flags.bools).forEach(function(key2) {
        setArg(key2, defaults2[key2] === void 0 ? false : defaults2[key2]);
      });
      var notFlags = [];
      if (args.indexOf("--") !== -1) {
        notFlags = args.slice(args.indexOf("--") + 1);
        args = args.slice(0, args.indexOf("--"));
      }
      for (var i = 0; i < args.length; i++) {
        var arg = args[i];
        var key;
        var next;
        if (/^--.+=/.test(arg)) {
          var m = arg.match(/^--([^=]+)=([\s\S]*)$/);
          key = m[1];
          var value = m[2];
          if (flags.bools[key]) {
            value = value !== "false";
          }
          setArg(key, value, arg);
        } else if (/^--no-.+/.test(arg)) {
          key = arg.match(/^--no-(.+)/)[1];
          setArg(key, false, arg);
        } else if (/^--.+/.test(arg)) {
          key = arg.match(/^--(.+)/)[1];
          next = args[i + 1];
          if (next !== void 0 && !/^(-|--)[^-]/.test(next) && !flags.bools[key] && !flags.allBools && (aliases[key] ? !aliasIsBoolean(key) : true)) {
            setArg(key, next, arg);
            i += 1;
          } else if (/^(true|false)$/.test(next)) {
            setArg(key, next === "true", arg);
            i += 1;
          } else {
            setArg(key, flags.strings[key] ? "" : true, arg);
          }
        } else if (/^-[^-]+/.test(arg)) {
          var letters = arg.slice(1, -1).split("");
          var broken = false;
          for (var j = 0; j < letters.length; j++) {
            next = arg.slice(j + 2);
            if (next === "-") {
              setArg(letters[j], next, arg);
              continue;
            }
            if (/[A-Za-z]/.test(letters[j]) && next[0] === "=") {
              setArg(letters[j], next.slice(1), arg);
              broken = true;
              break;
            }
            if (/[A-Za-z]/.test(letters[j]) && /-?\d+(\.\d*)?(e-?\d+)?$/.test(next)) {
              setArg(letters[j], next, arg);
              broken = true;
              break;
            }
            if (letters[j + 1] && letters[j + 1].match(/\W/)) {
              setArg(letters[j], arg.slice(j + 2), arg);
              broken = true;
              break;
            } else {
              setArg(letters[j], flags.strings[letters[j]] ? "" : true, arg);
            }
          }
          key = arg.slice(-1)[0];
          if (!broken && key !== "-") {
            if (args[i + 1] && !/^(-|--)[^-]/.test(args[i + 1]) && !flags.bools[key] && (aliases[key] ? !aliasIsBoolean(key) : true)) {
              setArg(key, args[i + 1], arg);
              i += 1;
            } else if (args[i + 1] && /^(true|false)$/.test(args[i + 1])) {
              setArg(key, args[i + 1] === "true", arg);
              i += 1;
            } else {
              setArg(key, flags.strings[key] ? "" : true, arg);
            }
          }
        } else {
          if (!flags.unknownFn || flags.unknownFn(arg) !== false) {
            argv._.push(flags.strings._ || !isNumber(arg) ? arg : Number(arg));
          }
          if (opts.stopEarly) {
            argv._.push.apply(argv._, args.slice(i + 1));
            break;
          }
        }
      }
      Object.keys(defaults2).forEach(function(k) {
        if (!hasKey(argv, k.split("."))) {
          setKey(argv, k.split("."), defaults2[k]);
          (aliases[k] || []).forEach(function(x) {
            setKey(argv, x.split("."), defaults2[k]);
          });
        }
      });
      if (opts["--"]) {
        argv["--"] = notFlags.slice();
      } else {
        notFlags.forEach(function(k) {
          argv._.push(k);
        });
      }
      return argv;
    };
  }
});

// node_modules/subarg/index.js
var require_subarg = __commonJS({
  "node_modules/subarg/index.js"(exports2, module2) {
    var minimist = require_minimist();
    module2.exports = function parse2(args, opts) {
      var level = 0, index;
      var args_ = [];
      for (var i = 0; i < args.length; i++) {
        if (typeof args[i] === "string" && /^\[/.test(args[i])) {
          if (level++ === 0) {
            index = i;
          }
        }
        if (typeof args[i] === "string" && /\]$/.test(args[i])) {
          if (--level > 0) continue;
          var sub = args.slice(index, i + 1);
          if (typeof sub[0] === "string") {
            sub[0] = sub[0].replace(/^\[/, "");
          }
          if (sub[0] === "") sub.shift();
          var n = sub.length - 1;
          if (typeof sub[n] === "string") {
            sub[n] = sub[n].replace(/\]$/, "");
          }
          if (sub[n] === "") sub.pop();
          args_.push(parse2(sub));
        } else if (level === 0) args_.push(args[i]);
      }
      var argv = minimist(args_, opts);
      return argv;
    };
  }
});

// node_modules/cli-table3/src/debug.js
var require_debug = __commonJS({
  "node_modules/cli-table3/src/debug.js"(exports2, module2) {
    var messages = [];
    var level = 0;
    var debug = (msg, min) => {
      if (level >= min) {
        messages.push(msg);
      }
    };
    debug.WARN = 1;
    debug.INFO = 2;
    debug.DEBUG = 3;
    debug.reset = () => {
      messages = [];
    };
    debug.setDebugLevel = (v) => {
      level = v;
    };
    debug.warn = (msg) => debug(msg, debug.WARN);
    debug.info = (msg) => debug(msg, debug.INFO);
    debug.debug = (msg) => debug(msg, debug.DEBUG);
    debug.debugMessages = () => messages;
    module2.exports = debug;
  }
});

// node_modules/ansi-regex/index.js
var require_ansi_regex = __commonJS({
  "node_modules/ansi-regex/index.js"(exports2, module2) {
    "use strict";
    module2.exports = ({ onlyFirst = false } = {}) => {
      const pattern = [
        "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
        "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))"
      ].join("|");
      return new RegExp(pattern, onlyFirst ? void 0 : "g");
    };
  }
});

// node_modules/strip-ansi/index.js
var require_strip_ansi = __commonJS({
  "node_modules/strip-ansi/index.js"(exports2, module2) {
    "use strict";
    var ansiRegex = require_ansi_regex();
    module2.exports = (string) => typeof string === "string" ? string.replace(ansiRegex(), "") : string;
  }
});

// node_modules/is-fullwidth-code-point/index.js
var require_is_fullwidth_code_point = __commonJS({
  "node_modules/is-fullwidth-code-point/index.js"(exports2, module2) {
    "use strict";
    var isFullwidthCodePoint = (codePoint) => {
      if (Number.isNaN(codePoint)) {
        return false;
      }
      if (codePoint >= 4352 && (codePoint <= 4447 || // Hangul Jamo
      codePoint === 9001 || // LEFT-POINTING ANGLE BRACKET
      codePoint === 9002 || // RIGHT-POINTING ANGLE BRACKET
      // CJK Radicals Supplement .. Enclosed CJK Letters and Months
      11904 <= codePoint && codePoint <= 12871 && codePoint !== 12351 || // Enclosed CJK Letters and Months .. CJK Unified Ideographs Extension A
      12880 <= codePoint && codePoint <= 19903 || // CJK Unified Ideographs .. Yi Radicals
      19968 <= codePoint && codePoint <= 42182 || // Hangul Jamo Extended-A
      43360 <= codePoint && codePoint <= 43388 || // Hangul Syllables
      44032 <= codePoint && codePoint <= 55203 || // CJK Compatibility Ideographs
      63744 <= codePoint && codePoint <= 64255 || // Vertical Forms
      65040 <= codePoint && codePoint <= 65049 || // CJK Compatibility Forms .. Small Form Variants
      65072 <= codePoint && codePoint <= 65131 || // Halfwidth and Fullwidth Forms
      65281 <= codePoint && codePoint <= 65376 || 65504 <= codePoint && codePoint <= 65510 || // Kana Supplement
      110592 <= codePoint && codePoint <= 110593 || // Enclosed Ideographic Supplement
      127488 <= codePoint && codePoint <= 127569 || // CJK Unified Ideographs Extension B .. Tertiary Ideographic Plane
      131072 <= codePoint && codePoint <= 262141)) {
        return true;
      }
      return false;
    };
    module2.exports = isFullwidthCodePoint;
    module2.exports.default = isFullwidthCodePoint;
  }
});

// node_modules/emoji-regex/index.js
var require_emoji_regex = __commonJS({
  "node_modules/emoji-regex/index.js"(exports2, module2) {
    "use strict";
    module2.exports = function() {
      return /\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62(?:\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67|\uDB40\uDC73\uDB40\uDC63\uDB40\uDC74|\uDB40\uDC77\uDB40\uDC6C\uDB40\uDC73)\uDB40\uDC7F|\uD83D\uDC68(?:\uD83C\uDFFC\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68\uD83C\uDFFB|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFF\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB-\uDFFE])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFE\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB-\uDFFD])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFD\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB\uDFFC])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\u200D(?:\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D)?\uD83D\uDC68|(?:\uD83D[\uDC68\uDC69])\u200D(?:\uD83D\uDC66\u200D\uD83D\uDC66|\uD83D\uDC67\u200D(?:\uD83D[\uDC66\uDC67]))|\uD83D\uDC66\u200D\uD83D\uDC66|\uD83D\uDC67\u200D(?:\uD83D[\uDC66\uDC67])|(?:\uD83D[\uDC68\uDC69])\u200D(?:\uD83D[\uDC66\uDC67])|[\u2695\u2696\u2708]\uFE0F|\uD83D[\uDC66\uDC67]|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|(?:\uD83C\uDFFB\u200D[\u2695\u2696\u2708]|\uD83C\uDFFF\u200D[\u2695\u2696\u2708]|\uD83C\uDFFE\u200D[\u2695\u2696\u2708]|\uD83C\uDFFD\u200D[\u2695\u2696\u2708]|\uD83C\uDFFC\u200D[\u2695\u2696\u2708])\uFE0F|\uD83C\uDFFB\u200D(?:\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C[\uDFFB-\uDFFF])|(?:\uD83E\uDDD1\uD83C\uDFFB\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFC\u200D\uD83E\uDD1D\u200D\uD83D\uDC69)\uD83C\uDFFB|\uD83E\uDDD1(?:\uD83C\uDFFF\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1(?:\uD83C[\uDFFB-\uDFFF])|\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1)|(?:\uD83E\uDDD1\uD83C\uDFFE\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFF\u200D\uD83E\uDD1D\u200D(?:\uD83D[\uDC68\uDC69]))(?:\uD83C[\uDFFB-\uDFFE])|(?:\uD83E\uDDD1\uD83C\uDFFC\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFD\u200D\uD83E\uDD1D\u200D\uD83D\uDC69)(?:\uD83C[\uDFFB\uDFFC])|\uD83D\uDC69(?:\uD83C\uDFFE\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB-\uDFFD\uDFFF])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFC\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB\uDFFD-\uDFFF])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFB\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFC-\uDFFF])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFD\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\u200D(?:\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D(?:\uD83D[\uDC68\uDC69])|\uD83D[\uDC68\uDC69])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFF\u200D(?:\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD]))|\uD83D\uDC69\u200D\uD83D\uDC69\u200D(?:\uD83D\uDC66\u200D\uD83D\uDC66|\uD83D\uDC67\u200D(?:\uD83D[\uDC66\uDC67]))|(?:\uD83E\uDDD1\uD83C\uDFFD\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFE\u200D\uD83E\uDD1D\u200D\uD83D\uDC69)(?:\uD83C[\uDFFB-\uDFFD])|\uD83D\uDC69\u200D\uD83D\uDC66\u200D\uD83D\uDC66|\uD83D\uDC69\u200D\uD83D\uDC69\u200D(?:\uD83D[\uDC66\uDC67])|(?:\uD83D\uDC41\uFE0F\u200D\uD83D\uDDE8|\uD83D\uDC69(?:\uD83C\uDFFF\u200D[\u2695\u2696\u2708]|\uD83C\uDFFE\u200D[\u2695\u2696\u2708]|\uD83C\uDFFC\u200D[\u2695\u2696\u2708]|\uD83C\uDFFB\u200D[\u2695\u2696\u2708]|\uD83C\uDFFD\u200D[\u2695\u2696\u2708]|\u200D[\u2695\u2696\u2708])|(?:(?:\u26F9|\uD83C[\uDFCB\uDFCC]|\uD83D\uDD75)\uFE0F|\uD83D\uDC6F|\uD83E[\uDD3C\uDDDE\uDDDF])\u200D[\u2640\u2642]|(?:\u26F9|\uD83C[\uDFCB\uDFCC]|\uD83D\uDD75)(?:\uD83C[\uDFFB-\uDFFF])\u200D[\u2640\u2642]|(?:\uD83C[\uDFC3\uDFC4\uDFCA]|\uD83D[\uDC6E\uDC71\uDC73\uDC77\uDC81\uDC82\uDC86\uDC87\uDE45-\uDE47\uDE4B\uDE4D\uDE4E\uDEA3\uDEB4-\uDEB6]|\uD83E[\uDD26\uDD37-\uDD39\uDD3D\uDD3E\uDDB8\uDDB9\uDDCD-\uDDCF\uDDD6-\uDDDD])(?:(?:\uD83C[\uDFFB-\uDFFF])\u200D[\u2640\u2642]|\u200D[\u2640\u2642])|\uD83C\uDFF4\u200D\u2620)\uFE0F|\uD83D\uDC69\u200D\uD83D\uDC67\u200D(?:\uD83D[\uDC66\uDC67])|\uD83C\uDFF3\uFE0F\u200D\uD83C\uDF08|\uD83D\uDC15\u200D\uD83E\uDDBA|\uD83D\uDC69\u200D\uD83D\uDC66|\uD83D\uDC69\u200D\uD83D\uDC67|\uD83C\uDDFD\uD83C\uDDF0|\uD83C\uDDF4\uD83C\uDDF2|\uD83C\uDDF6\uD83C\uDDE6|[#\*0-9]\uFE0F\u20E3|\uD83C\uDDE7(?:\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEF\uDDF1-\uDDF4\uDDF6-\uDDF9\uDDFB\uDDFC\uDDFE\uDDFF])|\uD83C\uDDF9(?:\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDED\uDDEF-\uDDF4\uDDF7\uDDF9\uDDFB\uDDFC\uDDFF])|\uD83C\uDDEA(?:\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDED\uDDF7-\uDDFA])|\uD83E\uDDD1(?:\uD83C[\uDFFB-\uDFFF])|\uD83C\uDDF7(?:\uD83C[\uDDEA\uDDF4\uDDF8\uDDFA\uDDFC])|\uD83D\uDC69(?:\uD83C[\uDFFB-\uDFFF])|\uD83C\uDDF2(?:\uD83C[\uDDE6\uDDE8-\uDDED\uDDF0-\uDDFF])|\uD83C\uDDE6(?:\uD83C[\uDDE8-\uDDEC\uDDEE\uDDF1\uDDF2\uDDF4\uDDF6-\uDDFA\uDDFC\uDDFD\uDDFF])|\uD83C\uDDF0(?:\uD83C[\uDDEA\uDDEC-\uDDEE\uDDF2\uDDF3\uDDF5\uDDF7\uDDFC\uDDFE\uDDFF])|\uD83C\uDDED(?:\uD83C[\uDDF0\uDDF2\uDDF3\uDDF7\uDDF9\uDDFA])|\uD83C\uDDE9(?:\uD83C[\uDDEA\uDDEC\uDDEF\uDDF0\uDDF2\uDDF4\uDDFF])|\uD83C\uDDFE(?:\uD83C[\uDDEA\uDDF9])|\uD83C\uDDEC(?:\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEE\uDDF1-\uDDF3\uDDF5-\uDDFA\uDDFC\uDDFE])|\uD83C\uDDF8(?:\uD83C[\uDDE6-\uDDEA\uDDEC-\uDDF4\uDDF7-\uDDF9\uDDFB\uDDFD-\uDDFF])|\uD83C\uDDEB(?:\uD83C[\uDDEE-\uDDF0\uDDF2\uDDF4\uDDF7])|\uD83C\uDDF5(?:\uD83C[\uDDE6\uDDEA-\uDDED\uDDF0-\uDDF3\uDDF7-\uDDF9\uDDFC\uDDFE])|\uD83C\uDDFB(?:\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDEE\uDDF3\uDDFA])|\uD83C\uDDF3(?:\uD83C[\uDDE6\uDDE8\uDDEA-\uDDEC\uDDEE\uDDF1\uDDF4\uDDF5\uDDF7\uDDFA\uDDFF])|\uD83C\uDDE8(?:\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDEE\uDDF0-\uDDF5\uDDF7\uDDFA-\uDDFF])|\uD83C\uDDF1(?:\uD83C[\uDDE6-\uDDE8\uDDEE\uDDF0\uDDF7-\uDDFB\uDDFE])|\uD83C\uDDFF(?:\uD83C[\uDDE6\uDDF2\uDDFC])|\uD83C\uDDFC(?:\uD83C[\uDDEB\uDDF8])|\uD83C\uDDFA(?:\uD83C[\uDDE6\uDDEC\uDDF2\uDDF3\uDDF8\uDDFE\uDDFF])|\uD83C\uDDEE(?:\uD83C[\uDDE8-\uDDEA\uDDF1-\uDDF4\uDDF6-\uDDF9])|\uD83C\uDDEF(?:\uD83C[\uDDEA\uDDF2\uDDF4\uDDF5])|(?:\uD83C[\uDFC3\uDFC4\uDFCA]|\uD83D[\uDC6E\uDC71\uDC73\uDC77\uDC81\uDC82\uDC86\uDC87\uDE45-\uDE47\uDE4B\uDE4D\uDE4E\uDEA3\uDEB4-\uDEB6]|\uD83E[\uDD26\uDD37-\uDD39\uDD3D\uDD3E\uDDB8\uDDB9\uDDCD-\uDDCF\uDDD6-\uDDDD])(?:\uD83C[\uDFFB-\uDFFF])|(?:\u26F9|\uD83C[\uDFCB\uDFCC]|\uD83D\uDD75)(?:\uD83C[\uDFFB-\uDFFF])|(?:[\u261D\u270A-\u270D]|\uD83C[\uDF85\uDFC2\uDFC7]|\uD83D[\uDC42\uDC43\uDC46-\uDC50\uDC66\uDC67\uDC6B-\uDC6D\uDC70\uDC72\uDC74-\uDC76\uDC78\uDC7C\uDC83\uDC85\uDCAA\uDD74\uDD7A\uDD90\uDD95\uDD96\uDE4C\uDE4F\uDEC0\uDECC]|\uD83E[\uDD0F\uDD18-\uDD1C\uDD1E\uDD1F\uDD30-\uDD36\uDDB5\uDDB6\uDDBB\uDDD2-\uDDD5])(?:\uD83C[\uDFFB-\uDFFF])|(?:[\u231A\u231B\u23E9-\u23EC\u23F0\u23F3\u25FD\u25FE\u2614\u2615\u2648-\u2653\u267F\u2693\u26A1\u26AA\u26AB\u26BD\u26BE\u26C4\u26C5\u26CE\u26D4\u26EA\u26F2\u26F3\u26F5\u26FA\u26FD\u2705\u270A\u270B\u2728\u274C\u274E\u2753-\u2755\u2757\u2795-\u2797\u27B0\u27BF\u2B1B\u2B1C\u2B50\u2B55]|\uD83C[\uDC04\uDCCF\uDD8E\uDD91-\uDD9A\uDDE6-\uDDFF\uDE01\uDE1A\uDE2F\uDE32-\uDE36\uDE38-\uDE3A\uDE50\uDE51\uDF00-\uDF20\uDF2D-\uDF35\uDF37-\uDF7C\uDF7E-\uDF93\uDFA0-\uDFCA\uDFCF-\uDFD3\uDFE0-\uDFF0\uDFF4\uDFF8-\uDFFF]|\uD83D[\uDC00-\uDC3E\uDC40\uDC42-\uDCFC\uDCFF-\uDD3D\uDD4B-\uDD4E\uDD50-\uDD67\uDD7A\uDD95\uDD96\uDDA4\uDDFB-\uDE4F\uDE80-\uDEC5\uDECC\uDED0-\uDED2\uDED5\uDEEB\uDEEC\uDEF4-\uDEFA\uDFE0-\uDFEB]|\uD83E[\uDD0D-\uDD3A\uDD3C-\uDD45\uDD47-\uDD71\uDD73-\uDD76\uDD7A-\uDDA2\uDDA5-\uDDAA\uDDAE-\uDDCA\uDDCD-\uDDFF\uDE70-\uDE73\uDE78-\uDE7A\uDE80-\uDE82\uDE90-\uDE95])|(?:[#\*0-9\xA9\xAE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u231A\u231B\u2328\u23CF\u23E9-\u23F3\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u261D\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692-\u2697\u2699\u269B\u269C\u26A0\u26A1\u26AA\u26AB\u26B0\u26B1\u26BD\u26BE\u26C4\u26C5\u26C8\u26CE\u26CF\u26D1\u26D3\u26D4\u26E9\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]|\uD83C[\uDC04\uDCCF\uDD70\uDD71\uDD7E\uDD7F\uDD8E\uDD91-\uDD9A\uDDE6-\uDDFF\uDE01\uDE02\uDE1A\uDE2F\uDE32-\uDE3A\uDE50\uDE51\uDF00-\uDF21\uDF24-\uDF93\uDF96\uDF97\uDF99-\uDF9B\uDF9E-\uDFF0\uDFF3-\uDFF5\uDFF7-\uDFFF]|\uD83D[\uDC00-\uDCFD\uDCFF-\uDD3D\uDD49-\uDD4E\uDD50-\uDD67\uDD6F\uDD70\uDD73-\uDD7A\uDD87\uDD8A-\uDD8D\uDD90\uDD95\uDD96\uDDA4\uDDA5\uDDA8\uDDB1\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA-\uDE4F\uDE80-\uDEC5\uDECB-\uDED2\uDED5\uDEE0-\uDEE5\uDEE9\uDEEB\uDEEC\uDEF0\uDEF3-\uDEFA\uDFE0-\uDFEB]|\uD83E[\uDD0D-\uDD3A\uDD3C-\uDD45\uDD47-\uDD71\uDD73-\uDD76\uDD7A-\uDDA2\uDDA5-\uDDAA\uDDAE-\uDDCA\uDDCD-\uDDFF\uDE70-\uDE73\uDE78-\uDE7A\uDE80-\uDE82\uDE90-\uDE95])\uFE0F|(?:[\u261D\u26F9\u270A-\u270D]|\uD83C[\uDF85\uDFC2-\uDFC4\uDFC7\uDFCA-\uDFCC]|\uD83D[\uDC42\uDC43\uDC46-\uDC50\uDC66-\uDC78\uDC7C\uDC81-\uDC83\uDC85-\uDC87\uDC8F\uDC91\uDCAA\uDD74\uDD75\uDD7A\uDD90\uDD95\uDD96\uDE45-\uDE47\uDE4B-\uDE4F\uDEA3\uDEB4-\uDEB6\uDEC0\uDECC]|\uD83E[\uDD0F\uDD18-\uDD1F\uDD26\uDD30-\uDD39\uDD3C-\uDD3E\uDDB5\uDDB6\uDDB8\uDDB9\uDDBB\uDDCD-\uDDCF\uDDD1-\uDDDD])/g;
    };
  }
});

// node_modules/string-width/index.js
var require_string_width = __commonJS({
  "node_modules/string-width/index.js"(exports2, module2) {
    "use strict";
    var stripAnsi = require_strip_ansi();
    var isFullwidthCodePoint = require_is_fullwidth_code_point();
    var emojiRegex = require_emoji_regex();
    var stringWidth = (string) => {
      if (typeof string !== "string" || string.length === 0) {
        return 0;
      }
      string = stripAnsi(string);
      if (string.length === 0) {
        return 0;
      }
      string = string.replace(emojiRegex(), "  ");
      let width = 0;
      for (let i = 0; i < string.length; i++) {
        const code = string.codePointAt(i);
        if (code <= 31 || code >= 127 && code <= 159) {
          continue;
        }
        if (code >= 768 && code <= 879) {
          continue;
        }
        if (code > 65535) {
          i++;
        }
        width += isFullwidthCodePoint(code) ? 2 : 1;
      }
      return width;
    };
    module2.exports = stringWidth;
    module2.exports.default = stringWidth;
  }
});

// node_modules/cli-table3/src/utils.js
var require_utils = __commonJS({
  "node_modules/cli-table3/src/utils.js"(exports2, module2) {
    var stringWidth = require_string_width();
    function codeRegex(capture) {
      return capture ? /\u001b\[((?:\d*;){0,5}\d*)m/g : /\u001b\[(?:\d*;){0,5}\d*m/g;
    }
    function strlen(str) {
      let code = codeRegex();
      let stripped = ("" + str).replace(code, "");
      let split = stripped.split("\n");
      return split.reduce(function(memo, s) {
        return stringWidth(s) > memo ? stringWidth(s) : memo;
      }, 0);
    }
    function repeat(str, times) {
      return Array(times + 1).join(str);
    }
    function pad(str, len, pad2, dir) {
      let length = strlen(str);
      if (len + 1 >= length) {
        let padlen = len - length;
        switch (dir) {
          case "right": {
            str = repeat(pad2, padlen) + str;
            break;
          }
          case "center": {
            let right = Math.ceil(padlen / 2);
            let left = padlen - right;
            str = repeat(pad2, left) + str + repeat(pad2, right);
            break;
          }
          default: {
            str = str + repeat(pad2, padlen);
            break;
          }
        }
      }
      return str;
    }
    var codeCache = {};
    function addToCodeCache(name, on, off) {
      on = "\x1B[" + on + "m";
      off = "\x1B[" + off + "m";
      codeCache[on] = { set: name, to: true };
      codeCache[off] = { set: name, to: false };
      codeCache[name] = { on, off };
    }
    addToCodeCache("bold", 1, 22);
    addToCodeCache("italics", 3, 23);
    addToCodeCache("underline", 4, 24);
    addToCodeCache("inverse", 7, 27);
    addToCodeCache("strikethrough", 9, 29);
    function updateState(state, controlChars) {
      let controlCode = controlChars[1] ? parseInt(controlChars[1].split(";")[0]) : 0;
      if (controlCode >= 30 && controlCode <= 39 || controlCode >= 90 && controlCode <= 97) {
        state.lastForegroundAdded = controlChars[0];
        return;
      }
      if (controlCode >= 40 && controlCode <= 49 || controlCode >= 100 && controlCode <= 107) {
        state.lastBackgroundAdded = controlChars[0];
        return;
      }
      if (controlCode === 0) {
        for (let i in state) {
          if (Object.prototype.hasOwnProperty.call(state, i)) {
            delete state[i];
          }
        }
        return;
      }
      let info = codeCache[controlChars[0]];
      if (info) {
        state[info.set] = info.to;
      }
    }
    function readState(line) {
      let code = codeRegex(true);
      let controlChars = code.exec(line);
      let state = {};
      while (controlChars !== null) {
        updateState(state, controlChars);
        controlChars = code.exec(line);
      }
      return state;
    }
    function unwindState(state, ret) {
      let lastBackgroundAdded = state.lastBackgroundAdded;
      let lastForegroundAdded = state.lastForegroundAdded;
      delete state.lastBackgroundAdded;
      delete state.lastForegroundAdded;
      Object.keys(state).forEach(function(key) {
        if (state[key]) {
          ret += codeCache[key].off;
        }
      });
      if (lastBackgroundAdded && lastBackgroundAdded != "\x1B[49m") {
        ret += "\x1B[49m";
      }
      if (lastForegroundAdded && lastForegroundAdded != "\x1B[39m") {
        ret += "\x1B[39m";
      }
      return ret;
    }
    function rewindState(state, ret) {
      let lastBackgroundAdded = state.lastBackgroundAdded;
      let lastForegroundAdded = state.lastForegroundAdded;
      delete state.lastBackgroundAdded;
      delete state.lastForegroundAdded;
      Object.keys(state).forEach(function(key) {
        if (state[key]) {
          ret = codeCache[key].on + ret;
        }
      });
      if (lastBackgroundAdded && lastBackgroundAdded != "\x1B[49m") {
        ret = lastBackgroundAdded + ret;
      }
      if (lastForegroundAdded && lastForegroundAdded != "\x1B[39m") {
        ret = lastForegroundAdded + ret;
      }
      return ret;
    }
    function truncateWidth(str, desiredLength) {
      if (str.length === strlen(str)) {
        return str.substr(0, desiredLength);
      }
      while (strlen(str) > desiredLength) {
        str = str.slice(0, -1);
      }
      return str;
    }
    function truncateWidthWithAnsi(str, desiredLength) {
      let code = codeRegex(true);
      let split = str.split(codeRegex());
      let splitIndex = 0;
      let retLen = 0;
      let ret = "";
      let myArray;
      let state = {};
      while (retLen < desiredLength) {
        myArray = code.exec(str);
        let toAdd = split[splitIndex];
        splitIndex++;
        if (retLen + strlen(toAdd) > desiredLength) {
          toAdd = truncateWidth(toAdd, desiredLength - retLen);
        }
        ret += toAdd;
        retLen += strlen(toAdd);
        if (retLen < desiredLength) {
          if (!myArray) {
            break;
          }
          ret += myArray[0];
          updateState(state, myArray);
        }
      }
      return unwindState(state, ret);
    }
    function truncate(str, desiredLength, truncateChar) {
      truncateChar = truncateChar || "\u2026";
      let lengthOfStr = strlen(str);
      if (lengthOfStr <= desiredLength) {
        return str;
      }
      desiredLength -= strlen(truncateChar);
      let ret = truncateWidthWithAnsi(str, desiredLength);
      ret += truncateChar;
      const hrefTag = "\x1B]8;;\x07";
      if (str.includes(hrefTag) && !ret.includes(hrefTag)) {
        ret += hrefTag;
      }
      return ret;
    }
    function defaultOptions() {
      return {
        chars: {
          top: "\u2500",
          "top-mid": "\u252C",
          "top-left": "\u250C",
          "top-right": "\u2510",
          bottom: "\u2500",
          "bottom-mid": "\u2534",
          "bottom-left": "\u2514",
          "bottom-right": "\u2518",
          left: "\u2502",
          "left-mid": "\u251C",
          mid: "\u2500",
          "mid-mid": "\u253C",
          right: "\u2502",
          "right-mid": "\u2524",
          middle: "\u2502"
        },
        truncate: "\u2026",
        colWidths: [],
        rowHeights: [],
        colAligns: [],
        rowAligns: [],
        style: {
          "padding-left": 1,
          "padding-right": 1,
          head: ["red"],
          border: ["grey"],
          compact: false
        },
        head: []
      };
    }
    function mergeOptions(options, defaults2) {
      options = options || {};
      defaults2 = defaults2 || defaultOptions();
      let ret = Object.assign({}, defaults2, options);
      ret.chars = Object.assign({}, defaults2.chars, options.chars);
      ret.style = Object.assign({}, defaults2.style, options.style);
      return ret;
    }
    function wordWrap(maxLength, input) {
      let lines = [];
      let split = input.split(/(\s+)/g);
      let line = [];
      let lineLength = 0;
      let whitespace;
      for (let i = 0; i < split.length; i += 2) {
        let word = split[i];
        let newLength = lineLength + strlen(word);
        if (lineLength > 0 && whitespace) {
          newLength += whitespace.length;
        }
        if (newLength > maxLength) {
          if (lineLength !== 0) {
            lines.push(line.join(""));
          }
          line = [word];
          lineLength = strlen(word);
        } else {
          line.push(whitespace || "", word);
          lineLength = newLength;
        }
        whitespace = split[i + 1];
      }
      if (lineLength) {
        lines.push(line.join(""));
      }
      return lines;
    }
    function textWrap(maxLength, input) {
      let lines = [];
      let line = "";
      function pushLine(str, ws) {
        if (line.length && ws) line += ws;
        line += str;
        while (line.length > maxLength) {
          lines.push(line.slice(0, maxLength));
          line = line.slice(maxLength);
        }
      }
      let split = input.split(/(\s+)/g);
      for (let i = 0; i < split.length; i += 2) {
        pushLine(split[i], i && split[i - 1]);
      }
      if (line.length) lines.push(line);
      return lines;
    }
    function multiLineWordWrap(maxLength, input, wrapOnWordBoundary = true) {
      let output = [];
      input = input.split("\n");
      const handler = wrapOnWordBoundary ? wordWrap : textWrap;
      for (let i = 0; i < input.length; i++) {
        output.push.apply(output, handler(maxLength, input[i]));
      }
      return output;
    }
    function colorizeLines(input) {
      let state = {};
      let output = [];
      for (let i = 0; i < input.length; i++) {
        let line = rewindState(state, input[i]);
        state = readState(line);
        let temp = Object.assign({}, state);
        output.push(unwindState(temp, line));
      }
      return output;
    }
    function hyperlink(url, text) {
      const OSC = "\x1B]";
      const BEL = "\x07";
      const SEP = ";";
      return [OSC, "8", SEP, SEP, url || text, BEL, text, OSC, "8", SEP, SEP, BEL].join("");
    }
    module2.exports = {
      strlen,
      repeat,
      pad,
      truncate,
      mergeOptions,
      wordWrap: multiLineWordWrap,
      colorizeLines,
      hyperlink
    };
  }
});

// node_modules/@colors/colors/lib/styles.js
var require_styles = __commonJS({
  "node_modules/@colors/colors/lib/styles.js"(exports2, module2) {
    var styles = {};
    module2["exports"] = styles;
    var codes = {
      reset: [0, 0],
      bold: [1, 22],
      dim: [2, 22],
      italic: [3, 23],
      underline: [4, 24],
      inverse: [7, 27],
      hidden: [8, 28],
      strikethrough: [9, 29],
      black: [30, 39],
      red: [31, 39],
      green: [32, 39],
      yellow: [33, 39],
      blue: [34, 39],
      magenta: [35, 39],
      cyan: [36, 39],
      white: [37, 39],
      gray: [90, 39],
      grey: [90, 39],
      brightRed: [91, 39],
      brightGreen: [92, 39],
      brightYellow: [93, 39],
      brightBlue: [94, 39],
      brightMagenta: [95, 39],
      brightCyan: [96, 39],
      brightWhite: [97, 39],
      bgBlack: [40, 49],
      bgRed: [41, 49],
      bgGreen: [42, 49],
      bgYellow: [43, 49],
      bgBlue: [44, 49],
      bgMagenta: [45, 49],
      bgCyan: [46, 49],
      bgWhite: [47, 49],
      bgGray: [100, 49],
      bgGrey: [100, 49],
      bgBrightRed: [101, 49],
      bgBrightGreen: [102, 49],
      bgBrightYellow: [103, 49],
      bgBrightBlue: [104, 49],
      bgBrightMagenta: [105, 49],
      bgBrightCyan: [106, 49],
      bgBrightWhite: [107, 49],
      // legacy styles for colors pre v1.0.0
      blackBG: [40, 49],
      redBG: [41, 49],
      greenBG: [42, 49],
      yellowBG: [43, 49],
      blueBG: [44, 49],
      magentaBG: [45, 49],
      cyanBG: [46, 49],
      whiteBG: [47, 49]
    };
    Object.keys(codes).forEach(function(key) {
      var val = codes[key];
      var style = styles[key] = [];
      style.open = "\x1B[" + val[0] + "m";
      style.close = "\x1B[" + val[1] + "m";
    });
  }
});

// node_modules/@colors/colors/lib/system/has-flag.js
var require_has_flag = __commonJS({
  "node_modules/@colors/colors/lib/system/has-flag.js"(exports2, module2) {
    "use strict";
    module2.exports = function(flag, argv) {
      argv = argv || process.argv;
      var terminatorPos = argv.indexOf("--");
      var prefix = /^-{1,2}/.test(flag) ? "" : "--";
      var pos = argv.indexOf(prefix + flag);
      return pos !== -1 && (terminatorPos === -1 ? true : pos < terminatorPos);
    };
  }
});

// node_modules/@colors/colors/lib/system/supports-colors.js
var require_supports_colors = __commonJS({
  "node_modules/@colors/colors/lib/system/supports-colors.js"(exports2, module2) {
    "use strict";
    var os2 = require("os");
    var hasFlag = require_has_flag();
    var env = process.env;
    var forceColor = void 0;
    if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false")) {
      forceColor = false;
    } else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
      forceColor = true;
    }
    if ("FORCE_COLOR" in env) {
      forceColor = env.FORCE_COLOR.length === 0 || parseInt(env.FORCE_COLOR, 10) !== 0;
    }
    function translateLevel(level) {
      if (level === 0) {
        return false;
      }
      return {
        level,
        hasBasic: true,
        has256: level >= 2,
        has16m: level >= 3
      };
    }
    function supportsColor(stream) {
      if (forceColor === false) {
        return 0;
      }
      if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
        return 3;
      }
      if (hasFlag("color=256")) {
        return 2;
      }
      if (stream && !stream.isTTY && forceColor !== true) {
        return 0;
      }
      var min = forceColor ? 1 : 0;
      if (process.platform === "win32") {
        var osRelease = os2.release().split(".");
        if (Number(process.versions.node.split(".")[0]) >= 8 && Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
          return Number(osRelease[2]) >= 14931 ? 3 : 2;
        }
        return 1;
      }
      if ("CI" in env) {
        if (["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI"].some(function(sign) {
          return sign in env;
        }) || env.CI_NAME === "codeship") {
          return 1;
        }
        return min;
      }
      if ("TEAMCITY_VERSION" in env) {
        return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
      }
      if ("TERM_PROGRAM" in env) {
        var version2 = parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
        switch (env.TERM_PROGRAM) {
          case "iTerm.app":
            return version2 >= 3 ? 3 : 2;
          case "Hyper":
            return 3;
          case "Apple_Terminal":
            return 2;
        }
      }
      if (/-256(color)?$/i.test(env.TERM)) {
        return 2;
      }
      if (/^screen|^xterm|^vt100|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
        return 1;
      }
      if ("COLORTERM" in env) {
        return 1;
      }
      if (env.TERM === "dumb") {
        return min;
      }
      return min;
    }
    function getSupportLevel(stream) {
      var level = supportsColor(stream);
      return translateLevel(level);
    }
    module2.exports = {
      supportsColor: getSupportLevel,
      stdout: getSupportLevel(process.stdout),
      stderr: getSupportLevel(process.stderr)
    };
  }
});

// node_modules/@colors/colors/lib/custom/trap.js
var require_trap = __commonJS({
  "node_modules/@colors/colors/lib/custom/trap.js"(exports2, module2) {
    module2["exports"] = function runTheTrap(text, options) {
      var result = "";
      text = text || "Run the trap, drop the bass";
      text = text.split("");
      var trap = {
        a: ["@", "\u0104", "\u023A", "\u0245", "\u0394", "\u039B", "\u0414"],
        b: ["\xDF", "\u0181", "\u0243", "\u026E", "\u03B2", "\u0E3F"],
        c: ["\xA9", "\u023B", "\u03FE"],
        d: ["\xD0", "\u018A", "\u0500", "\u0501", "\u0502", "\u0503"],
        e: [
          "\xCB",
          "\u0115",
          "\u018E",
          "\u0258",
          "\u03A3",
          "\u03BE",
          "\u04BC",
          "\u0A6C"
        ],
        f: ["\u04FA"],
        g: ["\u0262"],
        h: ["\u0126", "\u0195", "\u04A2", "\u04BA", "\u04C7", "\u050A"],
        i: ["\u0F0F"],
        j: ["\u0134"],
        k: ["\u0138", "\u04A0", "\u04C3", "\u051E"],
        l: ["\u0139"],
        m: ["\u028D", "\u04CD", "\u04CE", "\u0520", "\u0521", "\u0D69"],
        n: ["\xD1", "\u014B", "\u019D", "\u0376", "\u03A0", "\u048A"],
        o: [
          "\xD8",
          "\xF5",
          "\xF8",
          "\u01FE",
          "\u0298",
          "\u047A",
          "\u05DD",
          "\u06DD",
          "\u0E4F"
        ],
        p: ["\u01F7", "\u048E"],
        q: ["\u09CD"],
        r: ["\xAE", "\u01A6", "\u0210", "\u024C", "\u0280", "\u042F"],
        s: ["\xA7", "\u03DE", "\u03DF", "\u03E8"],
        t: ["\u0141", "\u0166", "\u0373"],
        u: ["\u01B1", "\u054D"],
        v: ["\u05D8"],
        w: ["\u0428", "\u0460", "\u047C", "\u0D70"],
        x: ["\u04B2", "\u04FE", "\u04FC", "\u04FD"],
        y: ["\xA5", "\u04B0", "\u04CB"],
        z: ["\u01B5", "\u0240"]
      };
      text.forEach(function(c) {
        c = c.toLowerCase();
        var chars = trap[c] || [" "];
        var rand = Math.floor(Math.random() * chars.length);
        if (typeof trap[c] !== "undefined") {
          result += trap[c][rand];
        } else {
          result += c;
        }
      });
      return result;
    };
  }
});

// node_modules/@colors/colors/lib/custom/zalgo.js
var require_zalgo = __commonJS({
  "node_modules/@colors/colors/lib/custom/zalgo.js"(exports2, module2) {
    module2["exports"] = function zalgo(text, options) {
      text = text || "   he is here   ";
      var soul = {
        "up": [
          "\u030D",
          "\u030E",
          "\u0304",
          "\u0305",
          "\u033F",
          "\u0311",
          "\u0306",
          "\u0310",
          "\u0352",
          "\u0357",
          "\u0351",
          "\u0307",
          "\u0308",
          "\u030A",
          "\u0342",
          "\u0313",
          "\u0308",
          "\u034A",
          "\u034B",
          "\u034C",
          "\u0303",
          "\u0302",
          "\u030C",
          "\u0350",
          "\u0300",
          "\u0301",
          "\u030B",
          "\u030F",
          "\u0312",
          "\u0313",
          "\u0314",
          "\u033D",
          "\u0309",
          "\u0363",
          "\u0364",
          "\u0365",
          "\u0366",
          "\u0367",
          "\u0368",
          "\u0369",
          "\u036A",
          "\u036B",
          "\u036C",
          "\u036D",
          "\u036E",
          "\u036F",
          "\u033E",
          "\u035B",
          "\u0346",
          "\u031A"
        ],
        "down": [
          "\u0316",
          "\u0317",
          "\u0318",
          "\u0319",
          "\u031C",
          "\u031D",
          "\u031E",
          "\u031F",
          "\u0320",
          "\u0324",
          "\u0325",
          "\u0326",
          "\u0329",
          "\u032A",
          "\u032B",
          "\u032C",
          "\u032D",
          "\u032E",
          "\u032F",
          "\u0330",
          "\u0331",
          "\u0332",
          "\u0333",
          "\u0339",
          "\u033A",
          "\u033B",
          "\u033C",
          "\u0345",
          "\u0347",
          "\u0348",
          "\u0349",
          "\u034D",
          "\u034E",
          "\u0353",
          "\u0354",
          "\u0355",
          "\u0356",
          "\u0359",
          "\u035A",
          "\u0323"
        ],
        "mid": [
          "\u0315",
          "\u031B",
          "\u0300",
          "\u0301",
          "\u0358",
          "\u0321",
          "\u0322",
          "\u0327",
          "\u0328",
          "\u0334",
          "\u0335",
          "\u0336",
          "\u035C",
          "\u035D",
          "\u035E",
          "\u035F",
          "\u0360",
          "\u0362",
          "\u0338",
          "\u0337",
          "\u0361",
          " \u0489"
        ]
      };
      var all = [].concat(soul.up, soul.down, soul.mid);
      function randomNumber(range) {
        var r = Math.floor(Math.random() * range);
        return r;
      }
      function isChar(character) {
        var bool = false;
        all.filter(function(i) {
          bool = i === character;
        });
        return bool;
      }
      function heComes(text2, options2) {
        var result = "";
        var counts;
        var l;
        options2 = options2 || {};
        options2["up"] = typeof options2["up"] !== "undefined" ? options2["up"] : true;
        options2["mid"] = typeof options2["mid"] !== "undefined" ? options2["mid"] : true;
        options2["down"] = typeof options2["down"] !== "undefined" ? options2["down"] : true;
        options2["size"] = typeof options2["size"] !== "undefined" ? options2["size"] : "maxi";
        text2 = text2.split("");
        for (l in text2) {
          if (isChar(l)) {
            continue;
          }
          result = result + text2[l];
          counts = { "up": 0, "down": 0, "mid": 0 };
          switch (options2.size) {
            case "mini":
              counts.up = randomNumber(8);
              counts.mid = randomNumber(2);
              counts.down = randomNumber(8);
              break;
            case "maxi":
              counts.up = randomNumber(16) + 3;
              counts.mid = randomNumber(4) + 1;
              counts.down = randomNumber(64) + 3;
              break;
            default:
              counts.up = randomNumber(8) + 1;
              counts.mid = randomNumber(6) / 2;
              counts.down = randomNumber(8) + 1;
              break;
          }
          var arr = ["up", "mid", "down"];
          for (var d in arr) {
            var index = arr[d];
            for (var i = 0; i <= counts[index]; i++) {
              if (options2[index]) {
                result = result + soul[index][randomNumber(soul[index].length)];
              }
            }
          }
        }
        return result;
      }
      return heComes(text, options);
    };
  }
});

// node_modules/@colors/colors/lib/maps/america.js
var require_america = __commonJS({
  "node_modules/@colors/colors/lib/maps/america.js"(exports2, module2) {
    module2["exports"] = function(colors) {
      return function(letter, i, exploded) {
        if (letter === " ") return letter;
        switch (i % 3) {
          case 0:
            return colors.red(letter);
          case 1:
            return colors.white(letter);
          case 2:
            return colors.blue(letter);
        }
      };
    };
  }
});

// node_modules/@colors/colors/lib/maps/zebra.js
var require_zebra = __commonJS({
  "node_modules/@colors/colors/lib/maps/zebra.js"(exports2, module2) {
    module2["exports"] = function(colors) {
      return function(letter, i, exploded) {
        return i % 2 === 0 ? letter : colors.inverse(letter);
      };
    };
  }
});

// node_modules/@colors/colors/lib/maps/rainbow.js
var require_rainbow = __commonJS({
  "node_modules/@colors/colors/lib/maps/rainbow.js"(exports2, module2) {
    module2["exports"] = function(colors) {
      var rainbowColors = ["red", "yellow", "green", "blue", "magenta"];
      return function(letter, i, exploded) {
        if (letter === " ") {
          return letter;
        } else {
          return colors[rainbowColors[i++ % rainbowColors.length]](letter);
        }
      };
    };
  }
});

// node_modules/@colors/colors/lib/maps/random.js
var require_random = __commonJS({
  "node_modules/@colors/colors/lib/maps/random.js"(exports2, module2) {
    module2["exports"] = function(colors) {
      var available = [
        "underline",
        "inverse",
        "grey",
        "yellow",
        "red",
        "green",
        "blue",
        "white",
        "cyan",
        "magenta",
        "brightYellow",
        "brightRed",
        "brightGreen",
        "brightBlue",
        "brightWhite",
        "brightCyan",
        "brightMagenta"
      ];
      return function(letter, i, exploded) {
        return letter === " " ? letter : colors[available[Math.round(Math.random() * (available.length - 2))]](letter);
      };
    };
  }
});

// node_modules/@colors/colors/lib/colors.js
var require_colors = __commonJS({
  "node_modules/@colors/colors/lib/colors.js"(exports2, module2) {
    var colors = {};
    module2["exports"] = colors;
    colors.themes = {};
    var util = require("util");
    var ansiStyles = colors.styles = require_styles();
    var defineProps = Object.defineProperties;
    var newLineRegex = new RegExp(/[\r\n]+/g);
    colors.supportsColor = require_supports_colors().supportsColor;
    if (typeof colors.enabled === "undefined") {
      colors.enabled = colors.supportsColor() !== false;
    }
    colors.enable = function() {
      colors.enabled = true;
    };
    colors.disable = function() {
      colors.enabled = false;
    };
    colors.stripColors = colors.strip = function(str) {
      return ("" + str).replace(/\x1B\[\d+m/g, "");
    };
    var stylize = colors.stylize = function stylize2(str, style) {
      if (!colors.enabled) {
        return str + "";
      }
      var styleMap = ansiStyles[style];
      if (!styleMap && style in colors) {
        return colors[style](str);
      }
      return styleMap.open + str + styleMap.close;
    };
    var matchOperatorsRe = /[|\\{}()[\]^$+*?.]/g;
    var escapeStringRegexp = function(str) {
      if (typeof str !== "string") {
        throw new TypeError("Expected a string");
      }
      return str.replace(matchOperatorsRe, "\\$&");
    };
    function build(_styles) {
      var builder = function builder2() {
        return applyStyle.apply(builder2, arguments);
      };
      builder._styles = _styles;
      builder.__proto__ = proto;
      return builder;
    }
    var styles = (function() {
      var ret = {};
      ansiStyles.grey = ansiStyles.gray;
      Object.keys(ansiStyles).forEach(function(key) {
        ansiStyles[key].closeRe = new RegExp(escapeStringRegexp(ansiStyles[key].close), "g");
        ret[key] = {
          get: function() {
            return build(this._styles.concat(key));
          }
        };
      });
      return ret;
    })();
    var proto = defineProps(function colors2() {
    }, styles);
    function applyStyle() {
      var args = Array.prototype.slice.call(arguments);
      var str = args.map(function(arg) {
        if (arg != null && arg.constructor === String) {
          return arg;
        } else {
          return util.inspect(arg);
        }
      }).join(" ");
      if (!colors.enabled || !str) {
        return str;
      }
      var newLinesPresent = str.indexOf("\n") != -1;
      var nestedStyles = this._styles;
      var i = nestedStyles.length;
      while (i--) {
        var code = ansiStyles[nestedStyles[i]];
        str = code.open + str.replace(code.closeRe, code.open) + code.close;
        if (newLinesPresent) {
          str = str.replace(newLineRegex, function(match) {
            return code.close + match + code.open;
          });
        }
      }
      return str;
    }
    colors.setTheme = function(theme) {
      if (typeof theme === "string") {
        console.log("colors.setTheme now only accepts an object, not a string.  If you are trying to set a theme from a file, it is now your (the caller's) responsibility to require the file.  The old syntax looked like colors.setTheme(__dirname + '/../themes/generic-logging.js'); The new syntax looks like colors.setTheme(require(__dirname + '/../themes/generic-logging.js'));");
        return;
      }
      for (var style in theme) {
        (function(style2) {
          colors[style2] = function(str) {
            if (typeof theme[style2] === "object") {
              var out = str;
              for (var i in theme[style2]) {
                out = colors[theme[style2][i]](out);
              }
              return out;
            }
            return colors[theme[style2]](str);
          };
        })(style);
      }
    };
    function init() {
      var ret = {};
      Object.keys(styles).forEach(function(name) {
        ret[name] = {
          get: function() {
            return build([name]);
          }
        };
      });
      return ret;
    }
    var sequencer = function sequencer2(map2, str) {
      var exploded = str.split("");
      exploded = exploded.map(map2);
      return exploded.join("");
    };
    colors.trap = require_trap();
    colors.zalgo = require_zalgo();
    colors.maps = {};
    colors.maps.america = require_america()(colors);
    colors.maps.zebra = require_zebra()(colors);
    colors.maps.rainbow = require_rainbow()(colors);
    colors.maps.random = require_random()(colors);
    for (map in colors.maps) {
      (function(map2) {
        colors[map2] = function(str) {
          return sequencer(colors.maps[map2], str);
        };
      })(map);
    }
    var map;
    defineProps(colors, init());
  }
});

// node_modules/@colors/colors/safe.js
var require_safe = __commonJS({
  "node_modules/@colors/colors/safe.js"(exports2, module2) {
    var colors = require_colors();
    module2["exports"] = colors;
  }
});

// node_modules/cli-table3/src/cell.js
var require_cell = __commonJS({
  "node_modules/cli-table3/src/cell.js"(exports2, module2) {
    var { info, debug } = require_debug();
    var utils = require_utils();
    var Cell = class _Cell {
      /**
       * A representation of a cell within the table.
       * Implementations must have `init` and `draw` methods,
       * as well as `colSpan`, `rowSpan`, `desiredHeight` and `desiredWidth` properties.
       * @param options
       * @constructor
       */
      constructor(options) {
        this.setOptions(options);
        this.x = null;
        this.y = null;
      }
      setOptions(options) {
        if (["boolean", "number", "bigint", "string"].indexOf(typeof options) !== -1) {
          options = { content: "" + options };
        }
        options = options || {};
        this.options = options;
        let content = options.content;
        if (["boolean", "number", "bigint", "string"].indexOf(typeof content) !== -1) {
          this.content = String(content);
        } else if (!content) {
          this.content = this.options.href || "";
        } else {
          throw new Error("Content needs to be a primitive, got: " + typeof content);
        }
        this.colSpan = options.colSpan || 1;
        this.rowSpan = options.rowSpan || 1;
        if (this.options.href) {
          Object.defineProperty(this, "href", {
            get() {
              return this.options.href;
            }
          });
        }
      }
      mergeTableOptions(tableOptions, cells) {
        this.cells = cells;
        let optionsChars = this.options.chars || {};
        let tableChars = tableOptions.chars;
        let chars = this.chars = {};
        CHAR_NAMES.forEach(function(name) {
          setOption(optionsChars, tableChars, name, chars);
        });
        this.truncate = this.options.truncate || tableOptions.truncate;
        let style = this.options.style = this.options.style || {};
        let tableStyle = tableOptions.style;
        setOption(style, tableStyle, "padding-left", this);
        setOption(style, tableStyle, "padding-right", this);
        this.head = style.head || tableStyle.head;
        this.border = style.border || tableStyle.border;
        this.fixedWidth = tableOptions.colWidths[this.x];
        this.lines = this.computeLines(tableOptions);
        this.desiredWidth = utils.strlen(this.content) + this.paddingLeft + this.paddingRight;
        this.desiredHeight = this.lines.length;
      }
      computeLines(tableOptions) {
        const tableWordWrap = tableOptions.wordWrap || tableOptions.textWrap;
        const { wordWrap = tableWordWrap } = this.options;
        if (this.fixedWidth && wordWrap) {
          this.fixedWidth -= this.paddingLeft + this.paddingRight;
          if (this.colSpan) {
            let i = 1;
            while (i < this.colSpan) {
              this.fixedWidth += tableOptions.colWidths[this.x + i];
              i++;
            }
          }
          const { wrapOnWordBoundary: tableWrapOnWordBoundary = true } = tableOptions;
          const { wrapOnWordBoundary = tableWrapOnWordBoundary } = this.options;
          return this.wrapLines(utils.wordWrap(this.fixedWidth, this.content, wrapOnWordBoundary));
        }
        return this.wrapLines(this.content.split("\n"));
      }
      wrapLines(computedLines) {
        const lines = utils.colorizeLines(computedLines);
        if (this.href) {
          return lines.map((line) => utils.hyperlink(this.href, line));
        }
        return lines;
      }
      /**
       * Initializes the Cells data structure.
       *
       * @param tableOptions - A fully populated set of tableOptions.
       * In addition to the standard default values, tableOptions must have fully populated the
       * `colWidths` and `rowWidths` arrays. Those arrays must have lengths equal to the number
       * of columns or rows (respectively) in this table, and each array item must be a Number.
       *
       */
      init(tableOptions) {
        let x = this.x;
        let y = this.y;
        this.widths = tableOptions.colWidths.slice(x, x + this.colSpan);
        this.heights = tableOptions.rowHeights.slice(y, y + this.rowSpan);
        this.width = this.widths.reduce(sumPlusOne, -1);
        this.height = this.heights.reduce(sumPlusOne, -1);
        this.hAlign = this.options.hAlign || tableOptions.colAligns[x];
        this.vAlign = this.options.vAlign || tableOptions.rowAligns[y];
        this.drawRight = x + this.colSpan == tableOptions.colWidths.length;
      }
      /**
       * Draws the given line of the cell.
       * This default implementation defers to methods `drawTop`, `drawBottom`, `drawLine` and `drawEmpty`.
       * @param lineNum - can be `top`, `bottom` or a numerical line number.
       * @param spanningCell - will be a number if being called from a RowSpanCell, and will represent how
       * many rows below it's being called from. Otherwise it's undefined.
       * @returns {String} The representation of this line.
       */
      draw(lineNum, spanningCell) {
        if (lineNum == "top") return this.drawTop(this.drawRight);
        if (lineNum == "bottom") return this.drawBottom(this.drawRight);
        let content = utils.truncate(this.content, 10, this.truncate);
        if (!lineNum) {
          info(`${this.y}-${this.x}: ${this.rowSpan - lineNum}x${this.colSpan} Cell ${content}`);
        } else {
        }
        let padLen = Math.max(this.height - this.lines.length, 0);
        let padTop;
        switch (this.vAlign) {
          case "center":
            padTop = Math.ceil(padLen / 2);
            break;
          case "bottom":
            padTop = padLen;
            break;
          default:
            padTop = 0;
        }
        if (lineNum < padTop || lineNum >= padTop + this.lines.length) {
          return this.drawEmpty(this.drawRight, spanningCell);
        }
        let forceTruncation = this.lines.length > this.height && lineNum + 1 >= this.height;
        return this.drawLine(lineNum - padTop, this.drawRight, forceTruncation, spanningCell);
      }
      /**
       * Renders the top line of the cell.
       * @param drawRight - true if this method should render the right edge of the cell.
       * @returns {String}
       */
      drawTop(drawRight) {
        let content = [];
        if (this.cells) {
          this.widths.forEach(function(width, index) {
            content.push(this._topLeftChar(index));
            content.push(utils.repeat(this.chars[this.y == 0 ? "top" : "mid"], width));
          }, this);
        } else {
          content.push(this._topLeftChar(0));
          content.push(utils.repeat(this.chars[this.y == 0 ? "top" : "mid"], this.width));
        }
        if (drawRight) {
          content.push(this.chars[this.y == 0 ? "topRight" : "rightMid"]);
        }
        return this.wrapWithStyleColors("border", content.join(""));
      }
      _topLeftChar(offset) {
        let x = this.x + offset;
        let leftChar;
        if (this.y == 0) {
          leftChar = x == 0 ? "topLeft" : offset == 0 ? "topMid" : "top";
        } else {
          if (x == 0) {
            leftChar = "leftMid";
          } else {
            leftChar = offset == 0 ? "midMid" : "bottomMid";
            if (this.cells) {
              let spanAbove = this.cells[this.y - 1][x] instanceof _Cell.ColSpanCell;
              if (spanAbove) {
                leftChar = offset == 0 ? "topMid" : "mid";
              }
              if (offset == 0) {
                let i = 1;
                while (this.cells[this.y][x - i] instanceof _Cell.ColSpanCell) {
                  i++;
                }
                if (this.cells[this.y][x - i] instanceof _Cell.RowSpanCell) {
                  leftChar = "leftMid";
                }
              }
            }
          }
        }
        return this.chars[leftChar];
      }
      wrapWithStyleColors(styleProperty, content) {
        if (this[styleProperty] && this[styleProperty].length) {
          try {
            let colors = require_safe();
            for (let i = this[styleProperty].length - 1; i >= 0; i--) {
              colors = colors[this[styleProperty][i]];
            }
            return colors(content);
          } catch (e) {
            return content;
          }
        } else {
          return content;
        }
      }
      /**
       * Renders a line of text.
       * @param lineNum - Which line of text to render. This is not necessarily the line within the cell.
       * There may be top-padding above the first line of text.
       * @param drawRight - true if this method should render the right edge of the cell.
       * @param forceTruncationSymbol - `true` if the rendered text should end with the truncation symbol even
       * if the text fits. This is used when the cell is vertically truncated. If `false` the text should
       * only include the truncation symbol if the text will not fit horizontally within the cell width.
       * @param spanningCell - a number of if being called from a RowSpanCell. (how many rows below). otherwise undefined.
       * @returns {String}
       */
      drawLine(lineNum, drawRight, forceTruncationSymbol, spanningCell) {
        let left = this.chars[this.x == 0 ? "left" : "middle"];
        if (this.x && spanningCell && this.cells) {
          let cellLeft = this.cells[this.y + spanningCell][this.x - 1];
          while (cellLeft instanceof ColSpanCell) {
            cellLeft = this.cells[cellLeft.y][cellLeft.x - 1];
          }
          if (!(cellLeft instanceof RowSpanCell)) {
            left = this.chars["rightMid"];
          }
        }
        let leftPadding = utils.repeat(" ", this.paddingLeft);
        let right = drawRight ? this.chars["right"] : "";
        let rightPadding = utils.repeat(" ", this.paddingRight);
        let line = this.lines[lineNum];
        let len = this.width - (this.paddingLeft + this.paddingRight);
        if (forceTruncationSymbol) line += this.truncate || "\u2026";
        let content = utils.truncate(line, len, this.truncate);
        content = utils.pad(content, len, " ", this.hAlign);
        content = leftPadding + content + rightPadding;
        return this.stylizeLine(left, content, right);
      }
      stylizeLine(left, content, right) {
        left = this.wrapWithStyleColors("border", left);
        right = this.wrapWithStyleColors("border", right);
        if (this.y === 0) {
          content = this.wrapWithStyleColors("head", content);
        }
        return left + content + right;
      }
      /**
       * Renders the bottom line of the cell.
       * @param drawRight - true if this method should render the right edge of the cell.
       * @returns {String}
       */
      drawBottom(drawRight) {
        let left = this.chars[this.x == 0 ? "bottomLeft" : "bottomMid"];
        let content = utils.repeat(this.chars.bottom, this.width);
        let right = drawRight ? this.chars["bottomRight"] : "";
        return this.wrapWithStyleColors("border", left + content + right);
      }
      /**
       * Renders a blank line of text within the cell. Used for top and/or bottom padding.
       * @param drawRight - true if this method should render the right edge of the cell.
       * @param spanningCell - a number of if being called from a RowSpanCell. (how many rows below). otherwise undefined.
       * @returns {String}
       */
      drawEmpty(drawRight, spanningCell) {
        let left = this.chars[this.x == 0 ? "left" : "middle"];
        if (this.x && spanningCell && this.cells) {
          let cellLeft = this.cells[this.y + spanningCell][this.x - 1];
          while (cellLeft instanceof ColSpanCell) {
            cellLeft = this.cells[cellLeft.y][cellLeft.x - 1];
          }
          if (!(cellLeft instanceof RowSpanCell)) {
            left = this.chars["rightMid"];
          }
        }
        let right = drawRight ? this.chars["right"] : "";
        let content = utils.repeat(" ", this.width);
        return this.stylizeLine(left, content, right);
      }
    };
    var ColSpanCell = class {
      /**
       * A Cell that doesn't do anything. It just draws empty lines.
       * Used as a placeholder in column spanning.
       * @constructor
       */
      constructor() {
      }
      draw(lineNum) {
        if (typeof lineNum === "number") {
          debug(`${this.y}-${this.x}: 1x1 ColSpanCell`);
        }
        return "";
      }
      init() {
      }
      mergeTableOptions() {
      }
    };
    var RowSpanCell = class {
      /**
       * A placeholder Cell for a Cell that spans multiple rows.
       * It delegates rendering to the original cell, but adds the appropriate offset.
       * @param originalCell
       * @constructor
       */
      constructor(originalCell) {
        this.originalCell = originalCell;
      }
      init(tableOptions) {
        let y = this.y;
        let originalY = this.originalCell.y;
        this.cellOffset = y - originalY;
        this.offset = findDimension(tableOptions.rowHeights, originalY, this.cellOffset);
      }
      draw(lineNum) {
        if (lineNum == "top") {
          return this.originalCell.draw(this.offset, this.cellOffset);
        }
        if (lineNum == "bottom") {
          return this.originalCell.draw("bottom");
        }
        debug(`${this.y}-${this.x}: 1x${this.colSpan} RowSpanCell for ${this.originalCell.content}`);
        return this.originalCell.draw(this.offset + 1 + lineNum);
      }
      mergeTableOptions() {
      }
    };
    function firstDefined(...args) {
      return args.filter((v) => v !== void 0 && v !== null).shift();
    }
    function setOption(objA, objB, nameB, targetObj) {
      let nameA = nameB.split("-");
      if (nameA.length > 1) {
        nameA[1] = nameA[1].charAt(0).toUpperCase() + nameA[1].substr(1);
        nameA = nameA.join("");
        targetObj[nameA] = firstDefined(objA[nameA], objA[nameB], objB[nameA], objB[nameB]);
      } else {
        targetObj[nameB] = firstDefined(objA[nameB], objB[nameB]);
      }
    }
    function findDimension(dimensionTable, startingIndex, span) {
      let ret = dimensionTable[startingIndex];
      for (let i = 1; i < span; i++) {
        ret += 1 + dimensionTable[startingIndex + i];
      }
      return ret;
    }
    function sumPlusOne(a, b) {
      return a + b + 1;
    }
    var CHAR_NAMES = [
      "top",
      "top-mid",
      "top-left",
      "top-right",
      "bottom",
      "bottom-mid",
      "bottom-left",
      "bottom-right",
      "left",
      "left-mid",
      "mid",
      "mid-mid",
      "right",
      "right-mid",
      "middle"
    ];
    module2.exports = Cell;
    module2.exports.ColSpanCell = ColSpanCell;
    module2.exports.RowSpanCell = RowSpanCell;
  }
});

// node_modules/cli-table3/src/layout-manager.js
var require_layout_manager = __commonJS({
  "node_modules/cli-table3/src/layout-manager.js"(exports2, module2) {
    var { warn, debug } = require_debug();
    var Cell = require_cell();
    var { ColSpanCell, RowSpanCell } = Cell;
    (function() {
      function next(alloc, col) {
        if (alloc[col] > 0) {
          return next(alloc, col + 1);
        }
        return col;
      }
      function layoutTable(table) {
        let alloc = {};
        table.forEach(function(row, rowIndex) {
          let col = 0;
          row.forEach(function(cell) {
            cell.y = rowIndex;
            cell.x = rowIndex ? next(alloc, col) : col;
            const rowSpan = cell.rowSpan || 1;
            const colSpan = cell.colSpan || 1;
            if (rowSpan > 1) {
              for (let cs = 0; cs < colSpan; cs++) {
                alloc[cell.x + cs] = rowSpan;
              }
            }
            col = cell.x + colSpan;
          });
          Object.keys(alloc).forEach((idx) => {
            alloc[idx]--;
            if (alloc[idx] < 1) delete alloc[idx];
          });
        });
      }
      function maxWidth(table) {
        let mw = 0;
        table.forEach(function(row) {
          row.forEach(function(cell) {
            mw = Math.max(mw, cell.x + (cell.colSpan || 1));
          });
        });
        return mw;
      }
      function maxHeight(table) {
        return table.length;
      }
      function cellsConflict(cell1, cell2) {
        let yMin1 = cell1.y;
        let yMax1 = cell1.y - 1 + (cell1.rowSpan || 1);
        let yMin2 = cell2.y;
        let yMax2 = cell2.y - 1 + (cell2.rowSpan || 1);
        let yConflict = !(yMin1 > yMax2 || yMin2 > yMax1);
        let xMin1 = cell1.x;
        let xMax1 = cell1.x - 1 + (cell1.colSpan || 1);
        let xMin2 = cell2.x;
        let xMax2 = cell2.x - 1 + (cell2.colSpan || 1);
        let xConflict = !(xMin1 > xMax2 || xMin2 > xMax1);
        return yConflict && xConflict;
      }
      function conflictExists(rows, x, y) {
        let i_max = Math.min(rows.length - 1, y);
        let cell = { x, y };
        for (let i = 0; i <= i_max; i++) {
          let row = rows[i];
          for (let j = 0; j < row.length; j++) {
            if (cellsConflict(cell, row[j])) {
              return true;
            }
          }
        }
        return false;
      }
      function allBlank(rows, y, xMin, xMax) {
        for (let x = xMin; x < xMax; x++) {
          if (conflictExists(rows, x, y)) {
            return false;
          }
        }
        return true;
      }
      function addRowSpanCells(table) {
        table.forEach(function(row, rowIndex) {
          row.forEach(function(cell) {
            for (let i = 1; i < cell.rowSpan; i++) {
              let rowSpanCell = new RowSpanCell(cell);
              rowSpanCell.x = cell.x;
              rowSpanCell.y = cell.y + i;
              rowSpanCell.colSpan = cell.colSpan;
              insertCell(rowSpanCell, table[rowIndex + i]);
            }
          });
        });
      }
      function addColSpanCells(cellRows) {
        for (let rowIndex = cellRows.length - 1; rowIndex >= 0; rowIndex--) {
          let cellColumns = cellRows[rowIndex];
          for (let columnIndex = 0; columnIndex < cellColumns.length; columnIndex++) {
            let cell = cellColumns[columnIndex];
            for (let k = 1; k < cell.colSpan; k++) {
              let colSpanCell = new ColSpanCell();
              colSpanCell.x = cell.x + k;
              colSpanCell.y = cell.y;
              cellColumns.splice(columnIndex + 1, 0, colSpanCell);
            }
          }
        }
      }
      function insertCell(cell, row) {
        let x = 0;
        while (x < row.length && row[x].x < cell.x) {
          x++;
        }
        row.splice(x, 0, cell);
      }
      function fillInTable(table) {
        let h_max = maxHeight(table);
        let w_max = maxWidth(table);
        debug(`Max rows: ${h_max}; Max cols: ${w_max}`);
        for (let y = 0; y < h_max; y++) {
          for (let x = 0; x < w_max; x++) {
            if (!conflictExists(table, x, y)) {
              let opts = { x, y, colSpan: 1, rowSpan: 1 };
              x++;
              while (x < w_max && !conflictExists(table, x, y)) {
                opts.colSpan++;
                x++;
              }
              let y2 = y + 1;
              while (y2 < h_max && allBlank(table, y2, opts.x, opts.x + opts.colSpan)) {
                opts.rowSpan++;
                y2++;
              }
              let cell = new Cell(opts);
              cell.x = opts.x;
              cell.y = opts.y;
              warn(`Missing cell at ${cell.y}-${cell.x}.`);
              insertCell(cell, table[y]);
            }
          }
        }
      }
      function generateCells(rows) {
        return rows.map(function(row) {
          if (!Array.isArray(row)) {
            let key = Object.keys(row)[0];
            row = row[key];
            if (Array.isArray(row)) {
              row = row.slice();
              row.unshift(key);
            } else {
              row = [key, row];
            }
          }
          return row.map(function(cell) {
            return new Cell(cell);
          });
        });
      }
      function makeTableLayout(rows) {
        let cellRows = generateCells(rows);
        layoutTable(cellRows);
        fillInTable(cellRows);
        addRowSpanCells(cellRows);
        addColSpanCells(cellRows);
        return cellRows;
      }
      module2.exports = {
        makeTableLayout,
        layoutTable,
        addRowSpanCells,
        maxWidth,
        fillInTable,
        computeWidths: makeComputeWidths("colSpan", "desiredWidth", "x", 1),
        computeHeights: makeComputeWidths("rowSpan", "desiredHeight", "y", 1)
      };
    })();
    function makeComputeWidths(colSpan, desiredWidth, x, forcedMin) {
      return function(vals, table) {
        let result = [];
        let spanners = [];
        let auto = {};
        table.forEach(function(row) {
          row.forEach(function(cell) {
            if ((cell[colSpan] || 1) > 1) {
              spanners.push(cell);
            } else {
              result[cell[x]] = Math.max(result[cell[x]] || 0, cell[desiredWidth] || 0, forcedMin);
            }
          });
        });
        vals.forEach(function(val, index) {
          if (typeof val === "number") {
            result[index] = val;
          }
        });
        for (let k = spanners.length - 1; k >= 0; k--) {
          let cell = spanners[k];
          let span = cell[colSpan];
          let col = cell[x];
          let existingWidth = result[col];
          let editableCols = typeof vals[col] === "number" ? 0 : 1;
          if (typeof existingWidth === "number") {
            for (let i = 1; i < span; i++) {
              existingWidth += 1 + result[col + i];
              if (typeof vals[col + i] !== "number") {
                editableCols++;
              }
            }
          } else {
            existingWidth = desiredWidth === "desiredWidth" ? cell.desiredWidth - 1 : 1;
            if (!auto[col] || auto[col] < existingWidth) {
              auto[col] = existingWidth;
            }
          }
          if (cell[desiredWidth] > existingWidth) {
            let i = 0;
            while (editableCols > 0 && cell[desiredWidth] > existingWidth) {
              if (typeof vals[col + i] !== "number") {
                let dif = Math.round((cell[desiredWidth] - existingWidth) / editableCols);
                existingWidth += dif;
                result[col + i] += dif;
                editableCols--;
              }
              i++;
            }
          }
        }
        Object.assign(vals, result, auto);
        for (let j = 0; j < vals.length; j++) {
          vals[j] = Math.max(forcedMin, vals[j] || 0);
        }
      };
    }
  }
});

// node_modules/cli-table3/src/table.js
var require_table = __commonJS({
  "node_modules/cli-table3/src/table.js"(exports2, module2) {
    var debug = require_debug();
    var utils = require_utils();
    var tableLayout = require_layout_manager();
    var Table = class extends Array {
      constructor(opts) {
        super();
        const options = utils.mergeOptions(opts);
        Object.defineProperty(this, "options", {
          value: options,
          enumerable: options.debug
        });
        if (options.debug) {
          switch (typeof options.debug) {
            case "boolean":
              debug.setDebugLevel(debug.WARN);
              break;
            case "number":
              debug.setDebugLevel(options.debug);
              break;
            case "string":
              debug.setDebugLevel(parseInt(options.debug, 10));
              break;
            default:
              debug.setDebugLevel(debug.WARN);
              debug.warn(`Debug option is expected to be boolean, number, or string. Received a ${typeof options.debug}`);
          }
          Object.defineProperty(this, "messages", {
            get() {
              return debug.debugMessages();
            }
          });
        }
      }
      toString() {
        let array = this;
        let headersPresent = this.options.head && this.options.head.length;
        if (headersPresent) {
          array = [this.options.head];
          if (this.length) {
            array.push.apply(array, this);
          }
        } else {
          this.options.style.head = [];
        }
        let cells = tableLayout.makeTableLayout(array);
        cells.forEach(function(row) {
          row.forEach(function(cell) {
            cell.mergeTableOptions(this.options, cells);
          }, this);
        }, this);
        tableLayout.computeWidths(this.options.colWidths, cells);
        tableLayout.computeHeights(this.options.rowHeights, cells);
        cells.forEach(function(row) {
          row.forEach(function(cell) {
            cell.init(this.options);
          }, this);
        }, this);
        let result = [];
        for (let rowIndex = 0; rowIndex < cells.length; rowIndex++) {
          let row = cells[rowIndex];
          let heightOfRow = this.options.rowHeights[rowIndex];
          if (rowIndex === 0 || !this.options.style.compact || rowIndex == 1 && headersPresent) {
            doDraw(row, "top", result);
          }
          for (let lineNum = 0; lineNum < heightOfRow; lineNum++) {
            doDraw(row, lineNum, result);
          }
          if (rowIndex + 1 == cells.length) {
            doDraw(row, "bottom", result);
          }
        }
        return result.join("\n");
      }
      get width() {
        let str = this.toString().split("\n");
        return str[0].length;
      }
    };
    Table.reset = () => debug.reset();
    function doDraw(row, lineNum, result) {
      let line = [];
      row.forEach(function(cell) {
        line.push(cell.draw(lineNum));
      });
      let str = line.join("");
      if (str.length) result.push(str);
    }
    module2.exports = Table;
  }
});

// node_modules/cli-table3/index.js
var require_cli_table3 = __commonJS({
  "node_modules/cli-table3/index.js"(exports2, module2) {
    module2.exports = require_table();
  }
});

// node_modules/color-name/index.js
var require_color_name = __commonJS({
  "node_modules/color-name/index.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      "aliceblue": [240, 248, 255],
      "antiquewhite": [250, 235, 215],
      "aqua": [0, 255, 255],
      "aquamarine": [127, 255, 212],
      "azure": [240, 255, 255],
      "beige": [245, 245, 220],
      "bisque": [255, 228, 196],
      "black": [0, 0, 0],
      "blanchedalmond": [255, 235, 205],
      "blue": [0, 0, 255],
      "blueviolet": [138, 43, 226],
      "brown": [165, 42, 42],
      "burlywood": [222, 184, 135],
      "cadetblue": [95, 158, 160],
      "chartreuse": [127, 255, 0],
      "chocolate": [210, 105, 30],
      "coral": [255, 127, 80],
      "cornflowerblue": [100, 149, 237],
      "cornsilk": [255, 248, 220],
      "crimson": [220, 20, 60],
      "cyan": [0, 255, 255],
      "darkblue": [0, 0, 139],
      "darkcyan": [0, 139, 139],
      "darkgoldenrod": [184, 134, 11],
      "darkgray": [169, 169, 169],
      "darkgreen": [0, 100, 0],
      "darkgrey": [169, 169, 169],
      "darkkhaki": [189, 183, 107],
      "darkmagenta": [139, 0, 139],
      "darkolivegreen": [85, 107, 47],
      "darkorange": [255, 140, 0],
      "darkorchid": [153, 50, 204],
      "darkred": [139, 0, 0],
      "darksalmon": [233, 150, 122],
      "darkseagreen": [143, 188, 143],
      "darkslateblue": [72, 61, 139],
      "darkslategray": [47, 79, 79],
      "darkslategrey": [47, 79, 79],
      "darkturquoise": [0, 206, 209],
      "darkviolet": [148, 0, 211],
      "deeppink": [255, 20, 147],
      "deepskyblue": [0, 191, 255],
      "dimgray": [105, 105, 105],
      "dimgrey": [105, 105, 105],
      "dodgerblue": [30, 144, 255],
      "firebrick": [178, 34, 34],
      "floralwhite": [255, 250, 240],
      "forestgreen": [34, 139, 34],
      "fuchsia": [255, 0, 255],
      "gainsboro": [220, 220, 220],
      "ghostwhite": [248, 248, 255],
      "gold": [255, 215, 0],
      "goldenrod": [218, 165, 32],
      "gray": [128, 128, 128],
      "green": [0, 128, 0],
      "greenyellow": [173, 255, 47],
      "grey": [128, 128, 128],
      "honeydew": [240, 255, 240],
      "hotpink": [255, 105, 180],
      "indianred": [205, 92, 92],
      "indigo": [75, 0, 130],
      "ivory": [255, 255, 240],
      "khaki": [240, 230, 140],
      "lavender": [230, 230, 250],
      "lavenderblush": [255, 240, 245],
      "lawngreen": [124, 252, 0],
      "lemonchiffon": [255, 250, 205],
      "lightblue": [173, 216, 230],
      "lightcoral": [240, 128, 128],
      "lightcyan": [224, 255, 255],
      "lightgoldenrodyellow": [250, 250, 210],
      "lightgray": [211, 211, 211],
      "lightgreen": [144, 238, 144],
      "lightgrey": [211, 211, 211],
      "lightpink": [255, 182, 193],
      "lightsalmon": [255, 160, 122],
      "lightseagreen": [32, 178, 170],
      "lightskyblue": [135, 206, 250],
      "lightslategray": [119, 136, 153],
      "lightslategrey": [119, 136, 153],
      "lightsteelblue": [176, 196, 222],
      "lightyellow": [255, 255, 224],
      "lime": [0, 255, 0],
      "limegreen": [50, 205, 50],
      "linen": [250, 240, 230],
      "magenta": [255, 0, 255],
      "maroon": [128, 0, 0],
      "mediumaquamarine": [102, 205, 170],
      "mediumblue": [0, 0, 205],
      "mediumorchid": [186, 85, 211],
      "mediumpurple": [147, 112, 219],
      "mediumseagreen": [60, 179, 113],
      "mediumslateblue": [123, 104, 238],
      "mediumspringgreen": [0, 250, 154],
      "mediumturquoise": [72, 209, 204],
      "mediumvioletred": [199, 21, 133],
      "midnightblue": [25, 25, 112],
      "mintcream": [245, 255, 250],
      "mistyrose": [255, 228, 225],
      "moccasin": [255, 228, 181],
      "navajowhite": [255, 222, 173],
      "navy": [0, 0, 128],
      "oldlace": [253, 245, 230],
      "olive": [128, 128, 0],
      "olivedrab": [107, 142, 35],
      "orange": [255, 165, 0],
      "orangered": [255, 69, 0],
      "orchid": [218, 112, 214],
      "palegoldenrod": [238, 232, 170],
      "palegreen": [152, 251, 152],
      "paleturquoise": [175, 238, 238],
      "palevioletred": [219, 112, 147],
      "papayawhip": [255, 239, 213],
      "peachpuff": [255, 218, 185],
      "peru": [205, 133, 63],
      "pink": [255, 192, 203],
      "plum": [221, 160, 221],
      "powderblue": [176, 224, 230],
      "purple": [128, 0, 128],
      "rebeccapurple": [102, 51, 153],
      "red": [255, 0, 0],
      "rosybrown": [188, 143, 143],
      "royalblue": [65, 105, 225],
      "saddlebrown": [139, 69, 19],
      "salmon": [250, 128, 114],
      "sandybrown": [244, 164, 96],
      "seagreen": [46, 139, 87],
      "seashell": [255, 245, 238],
      "sienna": [160, 82, 45],
      "silver": [192, 192, 192],
      "skyblue": [135, 206, 235],
      "slateblue": [106, 90, 205],
      "slategray": [112, 128, 144],
      "slategrey": [112, 128, 144],
      "snow": [255, 250, 250],
      "springgreen": [0, 255, 127],
      "steelblue": [70, 130, 180],
      "tan": [210, 180, 140],
      "teal": [0, 128, 128],
      "thistle": [216, 191, 216],
      "tomato": [255, 99, 71],
      "turquoise": [64, 224, 208],
      "violet": [238, 130, 238],
      "wheat": [245, 222, 179],
      "white": [255, 255, 255],
      "whitesmoke": [245, 245, 245],
      "yellow": [255, 255, 0],
      "yellowgreen": [154, 205, 50]
    };
  }
});

// node_modules/color-convert/conversions.js
var require_conversions = __commonJS({
  "node_modules/color-convert/conversions.js"(exports2, module2) {
    var cssKeywords = require_color_name();
    var reverseKeywords = {};
    for (const key of Object.keys(cssKeywords)) {
      reverseKeywords[cssKeywords[key]] = key;
    }
    var convert = {
      rgb: { channels: 3, labels: "rgb" },
      hsl: { channels: 3, labels: "hsl" },
      hsv: { channels: 3, labels: "hsv" },
      hwb: { channels: 3, labels: "hwb" },
      cmyk: { channels: 4, labels: "cmyk" },
      xyz: { channels: 3, labels: "xyz" },
      lab: { channels: 3, labels: "lab" },
      lch: { channels: 3, labels: "lch" },
      hex: { channels: 1, labels: ["hex"] },
      keyword: { channels: 1, labels: ["keyword"] },
      ansi16: { channels: 1, labels: ["ansi16"] },
      ansi256: { channels: 1, labels: ["ansi256"] },
      hcg: { channels: 3, labels: ["h", "c", "g"] },
      apple: { channels: 3, labels: ["r16", "g16", "b16"] },
      gray: { channels: 1, labels: ["gray"] }
    };
    module2.exports = convert;
    for (const model of Object.keys(convert)) {
      if (!("channels" in convert[model])) {
        throw new Error("missing channels property: " + model);
      }
      if (!("labels" in convert[model])) {
        throw new Error("missing channel labels property: " + model);
      }
      if (convert[model].labels.length !== convert[model].channels) {
        throw new Error("channel and label counts mismatch: " + model);
      }
      const { channels, labels } = convert[model];
      delete convert[model].channels;
      delete convert[model].labels;
      Object.defineProperty(convert[model], "channels", { value: channels });
      Object.defineProperty(convert[model], "labels", { value: labels });
    }
    convert.rgb.hsl = function(rgb) {
      const r = rgb[0] / 255;
      const g = rgb[1] / 255;
      const b = rgb[2] / 255;
      const min = Math.min(r, g, b);
      const max2 = Math.max(r, g, b);
      const delta = max2 - min;
      let h;
      let s;
      if (max2 === min) {
        h = 0;
      } else if (r === max2) {
        h = (g - b) / delta;
      } else if (g === max2) {
        h = 2 + (b - r) / delta;
      } else if (b === max2) {
        h = 4 + (r - g) / delta;
      }
      h = Math.min(h * 60, 360);
      if (h < 0) {
        h += 360;
      }
      const l = (min + max2) / 2;
      if (max2 === min) {
        s = 0;
      } else if (l <= 0.5) {
        s = delta / (max2 + min);
      } else {
        s = delta / (2 - max2 - min);
      }
      return [h, s * 100, l * 100];
    };
    convert.rgb.hsv = function(rgb) {
      let rdif;
      let gdif;
      let bdif;
      let h;
      let s;
      const r = rgb[0] / 255;
      const g = rgb[1] / 255;
      const b = rgb[2] / 255;
      const v = Math.max(r, g, b);
      const diff = v - Math.min(r, g, b);
      const diffc = function(c) {
        return (v - c) / 6 / diff + 1 / 2;
      };
      if (diff === 0) {
        h = 0;
        s = 0;
      } else {
        s = diff / v;
        rdif = diffc(r);
        gdif = diffc(g);
        bdif = diffc(b);
        if (r === v) {
          h = bdif - gdif;
        } else if (g === v) {
          h = 1 / 3 + rdif - bdif;
        } else if (b === v) {
          h = 2 / 3 + gdif - rdif;
        }
        if (h < 0) {
          h += 1;
        } else if (h > 1) {
          h -= 1;
        }
      }
      return [
        h * 360,
        s * 100,
        v * 100
      ];
    };
    convert.rgb.hwb = function(rgb) {
      const r = rgb[0];
      const g = rgb[1];
      let b = rgb[2];
      const h = convert.rgb.hsl(rgb)[0];
      const w = 1 / 255 * Math.min(r, Math.min(g, b));
      b = 1 - 1 / 255 * Math.max(r, Math.max(g, b));
      return [h, w * 100, b * 100];
    };
    convert.rgb.cmyk = function(rgb) {
      const r = rgb[0] / 255;
      const g = rgb[1] / 255;
      const b = rgb[2] / 255;
      const k = Math.min(1 - r, 1 - g, 1 - b);
      const c = (1 - r - k) / (1 - k) || 0;
      const m = (1 - g - k) / (1 - k) || 0;
      const y = (1 - b - k) / (1 - k) || 0;
      return [c * 100, m * 100, y * 100, k * 100];
    };
    function comparativeDistance(x, y) {
      return (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2;
    }
    convert.rgb.keyword = function(rgb) {
      const reversed = reverseKeywords[rgb];
      if (reversed) {
        return reversed;
      }
      let currentClosestDistance = Infinity;
      let currentClosestKeyword;
      for (const keyword of Object.keys(cssKeywords)) {
        const value = cssKeywords[keyword];
        const distance = comparativeDistance(rgb, value);
        if (distance < currentClosestDistance) {
          currentClosestDistance = distance;
          currentClosestKeyword = keyword;
        }
      }
      return currentClosestKeyword;
    };
    convert.keyword.rgb = function(keyword) {
      return cssKeywords[keyword];
    };
    convert.rgb.xyz = function(rgb) {
      let r = rgb[0] / 255;
      let g = rgb[1] / 255;
      let b = rgb[2] / 255;
      r = r > 0.04045 ? ((r + 0.055) / 1.055) ** 2.4 : r / 12.92;
      g = g > 0.04045 ? ((g + 0.055) / 1.055) ** 2.4 : g / 12.92;
      b = b > 0.04045 ? ((b + 0.055) / 1.055) ** 2.4 : b / 12.92;
      const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
      const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const z = r * 0.0193 + g * 0.1192 + b * 0.9505;
      return [x * 100, y * 100, z * 100];
    };
    convert.rgb.lab = function(rgb) {
      const xyz = convert.rgb.xyz(rgb);
      let x = xyz[0];
      let y = xyz[1];
      let z = xyz[2];
      x /= 95.047;
      y /= 100;
      z /= 108.883;
      x = x > 8856e-6 ? x ** (1 / 3) : 7.787 * x + 16 / 116;
      y = y > 8856e-6 ? y ** (1 / 3) : 7.787 * y + 16 / 116;
      z = z > 8856e-6 ? z ** (1 / 3) : 7.787 * z + 16 / 116;
      const l = 116 * y - 16;
      const a = 500 * (x - y);
      const b = 200 * (y - z);
      return [l, a, b];
    };
    convert.hsl.rgb = function(hsl) {
      const h = hsl[0] / 360;
      const s = hsl[1] / 100;
      const l = hsl[2] / 100;
      let t2;
      let t3;
      let val;
      if (s === 0) {
        val = l * 255;
        return [val, val, val];
      }
      if (l < 0.5) {
        t2 = l * (1 + s);
      } else {
        t2 = l + s - l * s;
      }
      const t1 = 2 * l - t2;
      const rgb = [0, 0, 0];
      for (let i = 0; i < 3; i++) {
        t3 = h + 1 / 3 * -(i - 1);
        if (t3 < 0) {
          t3++;
        }
        if (t3 > 1) {
          t3--;
        }
        if (6 * t3 < 1) {
          val = t1 + (t2 - t1) * 6 * t3;
        } else if (2 * t3 < 1) {
          val = t2;
        } else if (3 * t3 < 2) {
          val = t1 + (t2 - t1) * (2 / 3 - t3) * 6;
        } else {
          val = t1;
        }
        rgb[i] = val * 255;
      }
      return rgb;
    };
    convert.hsl.hsv = function(hsl) {
      const h = hsl[0];
      let s = hsl[1] / 100;
      let l = hsl[2] / 100;
      let smin = s;
      const lmin = Math.max(l, 0.01);
      l *= 2;
      s *= l <= 1 ? l : 2 - l;
      smin *= lmin <= 1 ? lmin : 2 - lmin;
      const v = (l + s) / 2;
      const sv = l === 0 ? 2 * smin / (lmin + smin) : 2 * s / (l + s);
      return [h, sv * 100, v * 100];
    };
    convert.hsv.rgb = function(hsv) {
      const h = hsv[0] / 60;
      const s = hsv[1] / 100;
      let v = hsv[2] / 100;
      const hi = Math.floor(h) % 6;
      const f = h - Math.floor(h);
      const p = 255 * v * (1 - s);
      const q = 255 * v * (1 - s * f);
      const t = 255 * v * (1 - s * (1 - f));
      v *= 255;
      switch (hi) {
        case 0:
          return [v, t, p];
        case 1:
          return [q, v, p];
        case 2:
          return [p, v, t];
        case 3:
          return [p, q, v];
        case 4:
          return [t, p, v];
        case 5:
          return [v, p, q];
      }
    };
    convert.hsv.hsl = function(hsv) {
      const h = hsv[0];
      const s = hsv[1] / 100;
      const v = hsv[2] / 100;
      const vmin = Math.max(v, 0.01);
      let sl;
      let l;
      l = (2 - s) * v;
      const lmin = (2 - s) * vmin;
      sl = s * vmin;
      sl /= lmin <= 1 ? lmin : 2 - lmin;
      sl = sl || 0;
      l /= 2;
      return [h, sl * 100, l * 100];
    };
    convert.hwb.rgb = function(hwb) {
      const h = hwb[0] / 360;
      let wh = hwb[1] / 100;
      let bl = hwb[2] / 100;
      const ratio = wh + bl;
      let f;
      if (ratio > 1) {
        wh /= ratio;
        bl /= ratio;
      }
      const i = Math.floor(6 * h);
      const v = 1 - bl;
      f = 6 * h - i;
      if ((i & 1) !== 0) {
        f = 1 - f;
      }
      const n = wh + f * (v - wh);
      let r;
      let g;
      let b;
      switch (i) {
        default:
        case 6:
        case 0:
          r = v;
          g = n;
          b = wh;
          break;
        case 1:
          r = n;
          g = v;
          b = wh;
          break;
        case 2:
          r = wh;
          g = v;
          b = n;
          break;
        case 3:
          r = wh;
          g = n;
          b = v;
          break;
        case 4:
          r = n;
          g = wh;
          b = v;
          break;
        case 5:
          r = v;
          g = wh;
          b = n;
          break;
      }
      return [r * 255, g * 255, b * 255];
    };
    convert.cmyk.rgb = function(cmyk) {
      const c = cmyk[0] / 100;
      const m = cmyk[1] / 100;
      const y = cmyk[2] / 100;
      const k = cmyk[3] / 100;
      const r = 1 - Math.min(1, c * (1 - k) + k);
      const g = 1 - Math.min(1, m * (1 - k) + k);
      const b = 1 - Math.min(1, y * (1 - k) + k);
      return [r * 255, g * 255, b * 255];
    };
    convert.xyz.rgb = function(xyz) {
      const x = xyz[0] / 100;
      const y = xyz[1] / 100;
      const z = xyz[2] / 100;
      let r;
      let g;
      let b;
      r = x * 3.2406 + y * -1.5372 + z * -0.4986;
      g = x * -0.9689 + y * 1.8758 + z * 0.0415;
      b = x * 0.0557 + y * -0.204 + z * 1.057;
      r = r > 31308e-7 ? 1.055 * r ** (1 / 2.4) - 0.055 : r * 12.92;
      g = g > 31308e-7 ? 1.055 * g ** (1 / 2.4) - 0.055 : g * 12.92;
      b = b > 31308e-7 ? 1.055 * b ** (1 / 2.4) - 0.055 : b * 12.92;
      r = Math.min(Math.max(0, r), 1);
      g = Math.min(Math.max(0, g), 1);
      b = Math.min(Math.max(0, b), 1);
      return [r * 255, g * 255, b * 255];
    };
    convert.xyz.lab = function(xyz) {
      let x = xyz[0];
      let y = xyz[1];
      let z = xyz[2];
      x /= 95.047;
      y /= 100;
      z /= 108.883;
      x = x > 8856e-6 ? x ** (1 / 3) : 7.787 * x + 16 / 116;
      y = y > 8856e-6 ? y ** (1 / 3) : 7.787 * y + 16 / 116;
      z = z > 8856e-6 ? z ** (1 / 3) : 7.787 * z + 16 / 116;
      const l = 116 * y - 16;
      const a = 500 * (x - y);
      const b = 200 * (y - z);
      return [l, a, b];
    };
    convert.lab.xyz = function(lab) {
      const l = lab[0];
      const a = lab[1];
      const b = lab[2];
      let x;
      let y;
      let z;
      y = (l + 16) / 116;
      x = a / 500 + y;
      z = y - b / 200;
      const y2 = y ** 3;
      const x2 = x ** 3;
      const z2 = z ** 3;
      y = y2 > 8856e-6 ? y2 : (y - 16 / 116) / 7.787;
      x = x2 > 8856e-6 ? x2 : (x - 16 / 116) / 7.787;
      z = z2 > 8856e-6 ? z2 : (z - 16 / 116) / 7.787;
      x *= 95.047;
      y *= 100;
      z *= 108.883;
      return [x, y, z];
    };
    convert.lab.lch = function(lab) {
      const l = lab[0];
      const a = lab[1];
      const b = lab[2];
      let h;
      const hr = Math.atan2(b, a);
      h = hr * 360 / 2 / Math.PI;
      if (h < 0) {
        h += 360;
      }
      const c = Math.sqrt(a * a + b * b);
      return [l, c, h];
    };
    convert.lch.lab = function(lch) {
      const l = lch[0];
      const c = lch[1];
      const h = lch[2];
      const hr = h / 360 * 2 * Math.PI;
      const a = c * Math.cos(hr);
      const b = c * Math.sin(hr);
      return [l, a, b];
    };
    convert.rgb.ansi16 = function(args, saturation = null) {
      const [r, g, b] = args;
      let value = saturation === null ? convert.rgb.hsv(args)[2] : saturation;
      value = Math.round(value / 50);
      if (value === 0) {
        return 30;
      }
      let ansi = 30 + (Math.round(b / 255) << 2 | Math.round(g / 255) << 1 | Math.round(r / 255));
      if (value === 2) {
        ansi += 60;
      }
      return ansi;
    };
    convert.hsv.ansi16 = function(args) {
      return convert.rgb.ansi16(convert.hsv.rgb(args), args[2]);
    };
    convert.rgb.ansi256 = function(args) {
      const r = args[0];
      const g = args[1];
      const b = args[2];
      if (r === g && g === b) {
        if (r < 8) {
          return 16;
        }
        if (r > 248) {
          return 231;
        }
        return Math.round((r - 8) / 247 * 24) + 232;
      }
      const ansi = 16 + 36 * Math.round(r / 255 * 5) + 6 * Math.round(g / 255 * 5) + Math.round(b / 255 * 5);
      return ansi;
    };
    convert.ansi16.rgb = function(args) {
      let color = args % 10;
      if (color === 0 || color === 7) {
        if (args > 50) {
          color += 3.5;
        }
        color = color / 10.5 * 255;
        return [color, color, color];
      }
      const mult = (~~(args > 50) + 1) * 0.5;
      const r = (color & 1) * mult * 255;
      const g = (color >> 1 & 1) * mult * 255;
      const b = (color >> 2 & 1) * mult * 255;
      return [r, g, b];
    };
    convert.ansi256.rgb = function(args) {
      if (args >= 232) {
        const c = (args - 232) * 10 + 8;
        return [c, c, c];
      }
      args -= 16;
      let rem;
      const r = Math.floor(args / 36) / 5 * 255;
      const g = Math.floor((rem = args % 36) / 6) / 5 * 255;
      const b = rem % 6 / 5 * 255;
      return [r, g, b];
    };
    convert.rgb.hex = function(args) {
      const integer = ((Math.round(args[0]) & 255) << 16) + ((Math.round(args[1]) & 255) << 8) + (Math.round(args[2]) & 255);
      const string = integer.toString(16).toUpperCase();
      return "000000".substring(string.length) + string;
    };
    convert.hex.rgb = function(args) {
      const match = args.toString(16).match(/[a-f0-9]{6}|[a-f0-9]{3}/i);
      if (!match) {
        return [0, 0, 0];
      }
      let colorString = match[0];
      if (match[0].length === 3) {
        colorString = colorString.split("").map((char) => {
          return char + char;
        }).join("");
      }
      const integer = parseInt(colorString, 16);
      const r = integer >> 16 & 255;
      const g = integer >> 8 & 255;
      const b = integer & 255;
      return [r, g, b];
    };
    convert.rgb.hcg = function(rgb) {
      const r = rgb[0] / 255;
      const g = rgb[1] / 255;
      const b = rgb[2] / 255;
      const max2 = Math.max(Math.max(r, g), b);
      const min = Math.min(Math.min(r, g), b);
      const chroma = max2 - min;
      let grayscale;
      let hue;
      if (chroma < 1) {
        grayscale = min / (1 - chroma);
      } else {
        grayscale = 0;
      }
      if (chroma <= 0) {
        hue = 0;
      } else if (max2 === r) {
        hue = (g - b) / chroma % 6;
      } else if (max2 === g) {
        hue = 2 + (b - r) / chroma;
      } else {
        hue = 4 + (r - g) / chroma;
      }
      hue /= 6;
      hue %= 1;
      return [hue * 360, chroma * 100, grayscale * 100];
    };
    convert.hsl.hcg = function(hsl) {
      const s = hsl[1] / 100;
      const l = hsl[2] / 100;
      const c = l < 0.5 ? 2 * s * l : 2 * s * (1 - l);
      let f = 0;
      if (c < 1) {
        f = (l - 0.5 * c) / (1 - c);
      }
      return [hsl[0], c * 100, f * 100];
    };
    convert.hsv.hcg = function(hsv) {
      const s = hsv[1] / 100;
      const v = hsv[2] / 100;
      const c = s * v;
      let f = 0;
      if (c < 1) {
        f = (v - c) / (1 - c);
      }
      return [hsv[0], c * 100, f * 100];
    };
    convert.hcg.rgb = function(hcg) {
      const h = hcg[0] / 360;
      const c = hcg[1] / 100;
      const g = hcg[2] / 100;
      if (c === 0) {
        return [g * 255, g * 255, g * 255];
      }
      const pure = [0, 0, 0];
      const hi = h % 1 * 6;
      const v = hi % 1;
      const w = 1 - v;
      let mg = 0;
      switch (Math.floor(hi)) {
        case 0:
          pure[0] = 1;
          pure[1] = v;
          pure[2] = 0;
          break;
        case 1:
          pure[0] = w;
          pure[1] = 1;
          pure[2] = 0;
          break;
        case 2:
          pure[0] = 0;
          pure[1] = 1;
          pure[2] = v;
          break;
        case 3:
          pure[0] = 0;
          pure[1] = w;
          pure[2] = 1;
          break;
        case 4:
          pure[0] = v;
          pure[1] = 0;
          pure[2] = 1;
          break;
        default:
          pure[0] = 1;
          pure[1] = 0;
          pure[2] = w;
      }
      mg = (1 - c) * g;
      return [
        (c * pure[0] + mg) * 255,
        (c * pure[1] + mg) * 255,
        (c * pure[2] + mg) * 255
      ];
    };
    convert.hcg.hsv = function(hcg) {
      const c = hcg[1] / 100;
      const g = hcg[2] / 100;
      const v = c + g * (1 - c);
      let f = 0;
      if (v > 0) {
        f = c / v;
      }
      return [hcg[0], f * 100, v * 100];
    };
    convert.hcg.hsl = function(hcg) {
      const c = hcg[1] / 100;
      const g = hcg[2] / 100;
      const l = g * (1 - c) + 0.5 * c;
      let s = 0;
      if (l > 0 && l < 0.5) {
        s = c / (2 * l);
      } else if (l >= 0.5 && l < 1) {
        s = c / (2 * (1 - l));
      }
      return [hcg[0], s * 100, l * 100];
    };
    convert.hcg.hwb = function(hcg) {
      const c = hcg[1] / 100;
      const g = hcg[2] / 100;
      const v = c + g * (1 - c);
      return [hcg[0], (v - c) * 100, (1 - v) * 100];
    };
    convert.hwb.hcg = function(hwb) {
      const w = hwb[1] / 100;
      const b = hwb[2] / 100;
      const v = 1 - b;
      const c = v - w;
      let g = 0;
      if (c < 1) {
        g = (v - c) / (1 - c);
      }
      return [hwb[0], c * 100, g * 100];
    };
    convert.apple.rgb = function(apple) {
      return [apple[0] / 65535 * 255, apple[1] / 65535 * 255, apple[2] / 65535 * 255];
    };
    convert.rgb.apple = function(rgb) {
      return [rgb[0] / 255 * 65535, rgb[1] / 255 * 65535, rgb[2] / 255 * 65535];
    };
    convert.gray.rgb = function(args) {
      return [args[0] / 100 * 255, args[0] / 100 * 255, args[0] / 100 * 255];
    };
    convert.gray.hsl = function(args) {
      return [0, 0, args[0]];
    };
    convert.gray.hsv = convert.gray.hsl;
    convert.gray.hwb = function(gray) {
      return [0, 100, gray[0]];
    };
    convert.gray.cmyk = function(gray) {
      return [0, 0, 0, gray[0]];
    };
    convert.gray.lab = function(gray) {
      return [gray[0], 0, 0];
    };
    convert.gray.hex = function(gray) {
      const val = Math.round(gray[0] / 100 * 255) & 255;
      const integer = (val << 16) + (val << 8) + val;
      const string = integer.toString(16).toUpperCase();
      return "000000".substring(string.length) + string;
    };
    convert.rgb.gray = function(rgb) {
      const val = (rgb[0] + rgb[1] + rgb[2]) / 3;
      return [val / 255 * 100];
    };
  }
});

// node_modules/color-convert/route.js
var require_route = __commonJS({
  "node_modules/color-convert/route.js"(exports2, module2) {
    var conversions = require_conversions();
    function buildGraph() {
      const graph = {};
      const models = Object.keys(conversions);
      for (let len = models.length, i = 0; i < len; i++) {
        graph[models[i]] = {
          // http://jsperf.com/1-vs-infinity
          // micro-opt, but this is simple.
          distance: -1,
          parent: null
        };
      }
      return graph;
    }
    function deriveBFS(fromModel) {
      const graph = buildGraph();
      const queue = [fromModel];
      graph[fromModel].distance = 0;
      while (queue.length) {
        const current = queue.pop();
        const adjacents = Object.keys(conversions[current]);
        for (let len = adjacents.length, i = 0; i < len; i++) {
          const adjacent = adjacents[i];
          const node = graph[adjacent];
          if (node.distance === -1) {
            node.distance = graph[current].distance + 1;
            node.parent = current;
            queue.unshift(adjacent);
          }
        }
      }
      return graph;
    }
    function link(from, to) {
      return function(args) {
        return to(from(args));
      };
    }
    function wrapConversion(toModel, graph) {
      const path2 = [graph[toModel].parent, toModel];
      let fn = conversions[graph[toModel].parent][toModel];
      let cur = graph[toModel].parent;
      while (graph[cur].parent) {
        path2.unshift(graph[cur].parent);
        fn = link(conversions[graph[cur].parent][cur], fn);
        cur = graph[cur].parent;
      }
      fn.conversion = path2;
      return fn;
    }
    module2.exports = function(fromModel) {
      const graph = deriveBFS(fromModel);
      const conversion = {};
      const models = Object.keys(graph);
      for (let len = models.length, i = 0; i < len; i++) {
        const toModel = models[i];
        const node = graph[toModel];
        if (node.parent === null) {
          continue;
        }
        conversion[toModel] = wrapConversion(toModel, graph);
      }
      return conversion;
    };
  }
});

// node_modules/color-convert/index.js
var require_color_convert = __commonJS({
  "node_modules/color-convert/index.js"(exports2, module2) {
    var conversions = require_conversions();
    var route = require_route();
    var convert = {};
    var models = Object.keys(conversions);
    function wrapRaw(fn) {
      const wrappedFn = function(...args) {
        const arg0 = args[0];
        if (arg0 === void 0 || arg0 === null) {
          return arg0;
        }
        if (arg0.length > 1) {
          args = arg0;
        }
        return fn(args);
      };
      if ("conversion" in fn) {
        wrappedFn.conversion = fn.conversion;
      }
      return wrappedFn;
    }
    function wrapRounded(fn) {
      const wrappedFn = function(...args) {
        const arg0 = args[0];
        if (arg0 === void 0 || arg0 === null) {
          return arg0;
        }
        if (arg0.length > 1) {
          args = arg0;
        }
        const result = fn(args);
        if (typeof result === "object") {
          for (let len = result.length, i = 0; i < len; i++) {
            result[i] = Math.round(result[i]);
          }
        }
        return result;
      };
      if ("conversion" in fn) {
        wrappedFn.conversion = fn.conversion;
      }
      return wrappedFn;
    }
    models.forEach((fromModel) => {
      convert[fromModel] = {};
      Object.defineProperty(convert[fromModel], "channels", { value: conversions[fromModel].channels });
      Object.defineProperty(convert[fromModel], "labels", { value: conversions[fromModel].labels });
      const routes = route(fromModel);
      const routeModels = Object.keys(routes);
      routeModels.forEach((toModel) => {
        const fn = routes[toModel];
        convert[fromModel][toModel] = wrapRounded(fn);
        convert[fromModel][toModel].raw = wrapRaw(fn);
      });
    });
    module2.exports = convert;
  }
});

// node_modules/ansi-styles/index.js
var require_ansi_styles = __commonJS({
  "node_modules/ansi-styles/index.js"(exports2, module2) {
    "use strict";
    var wrapAnsi16 = (fn, offset) => (...args) => {
      const code = fn(...args);
      return `\x1B[${code + offset}m`;
    };
    var wrapAnsi256 = (fn, offset) => (...args) => {
      const code = fn(...args);
      return `\x1B[${38 + offset};5;${code}m`;
    };
    var wrapAnsi16m = (fn, offset) => (...args) => {
      const rgb = fn(...args);
      return `\x1B[${38 + offset};2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
    };
    var ansi2ansi = (n) => n;
    var rgb2rgb = (r, g, b) => [r, g, b];
    var setLazyProperty = (object, property, get) => {
      Object.defineProperty(object, property, {
        get: () => {
          const value = get();
          Object.defineProperty(object, property, {
            value,
            enumerable: true,
            configurable: true
          });
          return value;
        },
        enumerable: true,
        configurable: true
      });
    };
    var colorConvert;
    var makeDynamicStyles = (wrap, targetSpace, identity, isBackground) => {
      if (colorConvert === void 0) {
        colorConvert = require_color_convert();
      }
      const offset = isBackground ? 10 : 0;
      const styles = {};
      for (const [sourceSpace, suite] of Object.entries(colorConvert)) {
        const name = sourceSpace === "ansi16" ? "ansi" : sourceSpace;
        if (sourceSpace === targetSpace) {
          styles[name] = wrap(identity, offset);
        } else if (typeof suite === "object") {
          styles[name] = wrap(suite[targetSpace], offset);
        }
      }
      return styles;
    };
    function assembleStyles() {
      const codes = /* @__PURE__ */ new Map();
      const styles = {
        modifier: {
          reset: [0, 0],
          // 21 isn't widely supported and 22 does the same thing
          bold: [1, 22],
          dim: [2, 22],
          italic: [3, 23],
          underline: [4, 24],
          inverse: [7, 27],
          hidden: [8, 28],
          strikethrough: [9, 29]
        },
        color: {
          black: [30, 39],
          red: [31, 39],
          green: [32, 39],
          yellow: [33, 39],
          blue: [34, 39],
          magenta: [35, 39],
          cyan: [36, 39],
          white: [37, 39],
          // Bright color
          blackBright: [90, 39],
          redBright: [91, 39],
          greenBright: [92, 39],
          yellowBright: [93, 39],
          blueBright: [94, 39],
          magentaBright: [95, 39],
          cyanBright: [96, 39],
          whiteBright: [97, 39]
        },
        bgColor: {
          bgBlack: [40, 49],
          bgRed: [41, 49],
          bgGreen: [42, 49],
          bgYellow: [43, 49],
          bgBlue: [44, 49],
          bgMagenta: [45, 49],
          bgCyan: [46, 49],
          bgWhite: [47, 49],
          // Bright color
          bgBlackBright: [100, 49],
          bgRedBright: [101, 49],
          bgGreenBright: [102, 49],
          bgYellowBright: [103, 49],
          bgBlueBright: [104, 49],
          bgMagentaBright: [105, 49],
          bgCyanBright: [106, 49],
          bgWhiteBright: [107, 49]
        }
      };
      styles.color.gray = styles.color.blackBright;
      styles.bgColor.bgGray = styles.bgColor.bgBlackBright;
      styles.color.grey = styles.color.blackBright;
      styles.bgColor.bgGrey = styles.bgColor.bgBlackBright;
      for (const [groupName, group] of Object.entries(styles)) {
        for (const [styleName, style] of Object.entries(group)) {
          styles[styleName] = {
            open: `\x1B[${style[0]}m`,
            close: `\x1B[${style[1]}m`
          };
          group[styleName] = styles[styleName];
          codes.set(style[0], style[1]);
        }
        Object.defineProperty(styles, groupName, {
          value: group,
          enumerable: false
        });
      }
      Object.defineProperty(styles, "codes", {
        value: codes,
        enumerable: false
      });
      styles.color.close = "\x1B[39m";
      styles.bgColor.close = "\x1B[49m";
      setLazyProperty(styles.color, "ansi", () => makeDynamicStyles(wrapAnsi16, "ansi16", ansi2ansi, false));
      setLazyProperty(styles.color, "ansi256", () => makeDynamicStyles(wrapAnsi256, "ansi256", ansi2ansi, false));
      setLazyProperty(styles.color, "ansi16m", () => makeDynamicStyles(wrapAnsi16m, "rgb", rgb2rgb, false));
      setLazyProperty(styles.bgColor, "ansi", () => makeDynamicStyles(wrapAnsi16, "ansi16", ansi2ansi, true));
      setLazyProperty(styles.bgColor, "ansi256", () => makeDynamicStyles(wrapAnsi256, "ansi256", ansi2ansi, true));
      setLazyProperty(styles.bgColor, "ansi16m", () => makeDynamicStyles(wrapAnsi16m, "rgb", rgb2rgb, true));
      return styles;
    }
    Object.defineProperty(module2, "exports", {
      enumerable: true,
      get: assembleStyles
    });
  }
});

// node_modules/has-flag/index.js
var require_has_flag2 = __commonJS({
  "node_modules/has-flag/index.js"(exports2, module2) {
    "use strict";
    module2.exports = (flag, argv = process.argv) => {
      const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
      const position = argv.indexOf(prefix + flag);
      const terminatorPosition = argv.indexOf("--");
      return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
    };
  }
});

// node_modules/supports-color/index.js
var require_supports_color = __commonJS({
  "node_modules/supports-color/index.js"(exports2, module2) {
    "use strict";
    var os2 = require("os");
    var tty = require("tty");
    var hasFlag = require_has_flag2();
    var { env } = process;
    var forceColor;
    if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
      forceColor = 0;
    } else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
      forceColor = 1;
    }
    if ("FORCE_COLOR" in env) {
      if (env.FORCE_COLOR === "true") {
        forceColor = 1;
      } else if (env.FORCE_COLOR === "false") {
        forceColor = 0;
      } else {
        forceColor = env.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(env.FORCE_COLOR, 10), 3);
      }
    }
    function translateLevel(level) {
      if (level === 0) {
        return false;
      }
      return {
        level,
        hasBasic: true,
        has256: level >= 2,
        has16m: level >= 3
      };
    }
    function supportsColor(haveStream, streamIsTTY) {
      if (forceColor === 0) {
        return 0;
      }
      if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
        return 3;
      }
      if (hasFlag("color=256")) {
        return 2;
      }
      if (haveStream && !streamIsTTY && forceColor === void 0) {
        return 0;
      }
      const min = forceColor || 0;
      if (env.TERM === "dumb") {
        return min;
      }
      if (process.platform === "win32") {
        const osRelease = os2.release().split(".");
        if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
          return Number(osRelease[2]) >= 14931 ? 3 : 2;
        }
        return 1;
      }
      if ("CI" in env) {
        if (["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"].some((sign) => sign in env) || env.CI_NAME === "codeship") {
          return 1;
        }
        return min;
      }
      if ("TEAMCITY_VERSION" in env) {
        return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
      }
      if (env.COLORTERM === "truecolor") {
        return 3;
      }
      if ("TERM_PROGRAM" in env) {
        const version2 = parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
        switch (env.TERM_PROGRAM) {
          case "iTerm.app":
            return version2 >= 3 ? 3 : 2;
          case "Apple_Terminal":
            return 2;
        }
      }
      if (/-256(color)?$/i.test(env.TERM)) {
        return 2;
      }
      if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
        return 1;
      }
      if ("COLORTERM" in env) {
        return 1;
      }
      return min;
    }
    function getSupportLevel(stream) {
      const level = supportsColor(stream, stream && stream.isTTY);
      return translateLevel(level);
    }
    module2.exports = {
      supportsColor: getSupportLevel,
      stdout: translateLevel(supportsColor(true, tty.isatty(1))),
      stderr: translateLevel(supportsColor(true, tty.isatty(2)))
    };
  }
});

// node_modules/chalk/source/util.js
var require_util = __commonJS({
  "node_modules/chalk/source/util.js"(exports2, module2) {
    "use strict";
    var stringReplaceAll = (string, substring, replacer) => {
      let index = string.indexOf(substring);
      if (index === -1) {
        return string;
      }
      const substringLength = substring.length;
      let endIndex = 0;
      let returnValue = "";
      do {
        returnValue += string.substr(endIndex, index - endIndex) + substring + replacer;
        endIndex = index + substringLength;
        index = string.indexOf(substring, endIndex);
      } while (index !== -1);
      returnValue += string.substr(endIndex);
      return returnValue;
    };
    var stringEncaseCRLFWithFirstIndex = (string, prefix, postfix, index) => {
      let endIndex = 0;
      let returnValue = "";
      do {
        const gotCR = string[index - 1] === "\r";
        returnValue += string.substr(endIndex, (gotCR ? index - 1 : index) - endIndex) + prefix + (gotCR ? "\r\n" : "\n") + postfix;
        endIndex = index + 1;
        index = string.indexOf("\n", endIndex);
      } while (index !== -1);
      returnValue += string.substr(endIndex);
      return returnValue;
    };
    module2.exports = {
      stringReplaceAll,
      stringEncaseCRLFWithFirstIndex
    };
  }
});

// node_modules/chalk/source/templates.js
var require_templates = __commonJS({
  "node_modules/chalk/source/templates.js"(exports2, module2) {
    "use strict";
    var TEMPLATE_REGEX = /(?:\\(u(?:[a-f\d]{4}|\{[a-f\d]{1,6}\})|x[a-f\d]{2}|.))|(?:\{(~)?(\w+(?:\([^)]*\))?(?:\.\w+(?:\([^)]*\))?)*)(?:[ \t]|(?=\r?\n)))|(\})|((?:.|[\r\n\f])+?)/gi;
    var STYLE_REGEX = /(?:^|\.)(\w+)(?:\(([^)]*)\))?/g;
    var STRING_REGEX = /^(['"])((?:\\.|(?!\1)[^\\])*)\1$/;
    var ESCAPE_REGEX = /\\(u(?:[a-f\d]{4}|{[a-f\d]{1,6}})|x[a-f\d]{2}|.)|([^\\])/gi;
    var ESCAPES = /* @__PURE__ */ new Map([
      ["n", "\n"],
      ["r", "\r"],
      ["t", "	"],
      ["b", "\b"],
      ["f", "\f"],
      ["v", "\v"],
      ["0", "\0"],
      ["\\", "\\"],
      ["e", "\x1B"],
      ["a", "\x07"]
    ]);
    function unescape2(c) {
      const u = c[0] === "u";
      const bracket = c[1] === "{";
      if (u && !bracket && c.length === 5 || c[0] === "x" && c.length === 3) {
        return String.fromCharCode(parseInt(c.slice(1), 16));
      }
      if (u && bracket) {
        return String.fromCodePoint(parseInt(c.slice(2, -1), 16));
      }
      return ESCAPES.get(c) || c;
    }
    function parseArguments2(name, arguments_) {
      const results = [];
      const chunks = arguments_.trim().split(/\s*,\s*/g);
      let matches;
      for (const chunk of chunks) {
        const number = Number(chunk);
        if (!Number.isNaN(number)) {
          results.push(number);
        } else if (matches = chunk.match(STRING_REGEX)) {
          results.push(matches[2].replace(ESCAPE_REGEX, (m, escape, character) => escape ? unescape2(escape) : character));
        } else {
          throw new Error(`Invalid Chalk template style argument: ${chunk} (in style '${name}')`);
        }
      }
      return results;
    }
    function parseStyle(style) {
      STYLE_REGEX.lastIndex = 0;
      const results = [];
      let matches;
      while ((matches = STYLE_REGEX.exec(style)) !== null) {
        const name = matches[1];
        if (matches[2]) {
          const args = parseArguments2(name, matches[2]);
          results.push([name].concat(args));
        } else {
          results.push([name]);
        }
      }
      return results;
    }
    function buildStyle(chalk, styles) {
      const enabled = {};
      for (const layer of styles) {
        for (const style of layer.styles) {
          enabled[style[0]] = layer.inverse ? null : style.slice(1);
        }
      }
      let current = chalk;
      for (const [styleName, styles2] of Object.entries(enabled)) {
        if (!Array.isArray(styles2)) {
          continue;
        }
        if (!(styleName in current)) {
          throw new Error(`Unknown Chalk style: ${styleName}`);
        }
        current = styles2.length > 0 ? current[styleName](...styles2) : current[styleName];
      }
      return current;
    }
    module2.exports = (chalk, temporary) => {
      const styles = [];
      const chunks = [];
      let chunk = [];
      temporary.replace(TEMPLATE_REGEX, (m, escapeCharacter, inverse, style, close, character) => {
        if (escapeCharacter) {
          chunk.push(unescape2(escapeCharacter));
        } else if (style) {
          const string = chunk.join("");
          chunk = [];
          chunks.push(styles.length === 0 ? string : buildStyle(chalk, styles)(string));
          styles.push({ inverse, styles: parseStyle(style) });
        } else if (close) {
          if (styles.length === 0) {
            throw new Error("Found extraneous } in Chalk template literal");
          }
          chunks.push(buildStyle(chalk, styles)(chunk.join("")));
          chunk = [];
          styles.pop();
        } else {
          chunk.push(character);
        }
      });
      chunks.push(chunk.join(""));
      if (styles.length > 0) {
        const errMessage = `Chalk template literal is missing ${styles.length} closing bracket${styles.length === 1 ? "" : "s"} (\`}\`)`;
        throw new Error(errMessage);
      }
      return chunks.join("");
    };
  }
});

// node_modules/chalk/source/index.js
var require_source = __commonJS({
  "node_modules/chalk/source/index.js"(exports2, module2) {
    "use strict";
    var ansiStyles = require_ansi_styles();
    var { stdout: stdoutColor, stderr: stderrColor } = require_supports_color();
    var {
      stringReplaceAll,
      stringEncaseCRLFWithFirstIndex
    } = require_util();
    var { isArray } = Array;
    var levelMapping = [
      "ansi",
      "ansi",
      "ansi256",
      "ansi16m"
    ];
    var styles = /* @__PURE__ */ Object.create(null);
    var applyOptions = (object, options = {}) => {
      if (options.level && !(Number.isInteger(options.level) && options.level >= 0 && options.level <= 3)) {
        throw new Error("The `level` option should be an integer from 0 to 3");
      }
      const colorLevel = stdoutColor ? stdoutColor.level : 0;
      object.level = options.level === void 0 ? colorLevel : options.level;
    };
    var ChalkClass = class {
      constructor(options) {
        return chalkFactory(options);
      }
    };
    var chalkFactory = (options) => {
      const chalk2 = {};
      applyOptions(chalk2, options);
      chalk2.template = (...arguments_) => chalkTag(chalk2.template, ...arguments_);
      Object.setPrototypeOf(chalk2, Chalk.prototype);
      Object.setPrototypeOf(chalk2.template, chalk2);
      chalk2.template.constructor = () => {
        throw new Error("`chalk.constructor()` is deprecated. Use `new chalk.Instance()` instead.");
      };
      chalk2.template.Instance = ChalkClass;
      return chalk2.template;
    };
    function Chalk(options) {
      return chalkFactory(options);
    }
    for (const [styleName, style] of Object.entries(ansiStyles)) {
      styles[styleName] = {
        get() {
          const builder = createBuilder(this, createStyler(style.open, style.close, this._styler), this._isEmpty);
          Object.defineProperty(this, styleName, { value: builder });
          return builder;
        }
      };
    }
    styles.visible = {
      get() {
        const builder = createBuilder(this, this._styler, true);
        Object.defineProperty(this, "visible", { value: builder });
        return builder;
      }
    };
    var usedModels = ["rgb", "hex", "keyword", "hsl", "hsv", "hwb", "ansi", "ansi256"];
    for (const model of usedModels) {
      styles[model] = {
        get() {
          const { level } = this;
          return function(...arguments_) {
            const styler = createStyler(ansiStyles.color[levelMapping[level]][model](...arguments_), ansiStyles.color.close, this._styler);
            return createBuilder(this, styler, this._isEmpty);
          };
        }
      };
    }
    for (const model of usedModels) {
      const bgModel = "bg" + model[0].toUpperCase() + model.slice(1);
      styles[bgModel] = {
        get() {
          const { level } = this;
          return function(...arguments_) {
            const styler = createStyler(ansiStyles.bgColor[levelMapping[level]][model](...arguments_), ansiStyles.bgColor.close, this._styler);
            return createBuilder(this, styler, this._isEmpty);
          };
        }
      };
    }
    var proto = Object.defineProperties(() => {
    }, {
      ...styles,
      level: {
        enumerable: true,
        get() {
          return this._generator.level;
        },
        set(level) {
          this._generator.level = level;
        }
      }
    });
    var createStyler = (open, close, parent) => {
      let openAll;
      let closeAll;
      if (parent === void 0) {
        openAll = open;
        closeAll = close;
      } else {
        openAll = parent.openAll + open;
        closeAll = close + parent.closeAll;
      }
      return {
        open,
        close,
        openAll,
        closeAll,
        parent
      };
    };
    var createBuilder = (self2, _styler, _isEmpty) => {
      const builder = (...arguments_) => {
        if (isArray(arguments_[0]) && isArray(arguments_[0].raw)) {
          return applyStyle(builder, chalkTag(builder, ...arguments_));
        }
        return applyStyle(builder, arguments_.length === 1 ? "" + arguments_[0] : arguments_.join(" "));
      };
      Object.setPrototypeOf(builder, proto);
      builder._generator = self2;
      builder._styler = _styler;
      builder._isEmpty = _isEmpty;
      return builder;
    };
    var applyStyle = (self2, string) => {
      if (self2.level <= 0 || !string) {
        return self2._isEmpty ? "" : string;
      }
      let styler = self2._styler;
      if (styler === void 0) {
        return string;
      }
      const { openAll, closeAll } = styler;
      if (string.indexOf("\x1B") !== -1) {
        while (styler !== void 0) {
          string = stringReplaceAll(string, styler.close, styler.open);
          styler = styler.parent;
        }
      }
      const lfIndex = string.indexOf("\n");
      if (lfIndex !== -1) {
        string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
      }
      return openAll + string + closeAll;
    };
    var template;
    var chalkTag = (chalk2, ...strings) => {
      const [firstString] = strings;
      if (!isArray(firstString) || !isArray(firstString.raw)) {
        return strings.join(" ");
      }
      const arguments_ = strings.slice(1);
      const parts = [firstString.raw[0]];
      for (let i = 1; i < firstString.length; i++) {
        parts.push(
          String(arguments_[i - 1]).replace(/[{}\\]/g, "\\$&"),
          String(firstString.raw[i])
        );
      }
      if (template === void 0) {
        template = require_templates();
      }
      return template(chalk2, parts.join(""));
    };
    Object.defineProperties(Chalk.prototype, styles);
    var chalk = Chalk();
    chalk.supportsColor = stdoutColor;
    chalk.stderr = Chalk({ level: stderrColor ? stderrColor.level : 0 });
    chalk.stderr.supportsColor = stderrColor;
    module2.exports = chalk;
  }
});

// node_modules/color-support/index.js
var require_color_support = __commonJS({
  "node_modules/color-support/index.js"(exports2, module2) {
    module2.exports = colorSupport({ alwaysReturn: true }, colorSupport);
    function hasNone(obj, options) {
      obj.level = 0;
      obj.hasBasic = false;
      obj.has256 = false;
      obj.has16m = false;
      if (!options.alwaysReturn) {
        return false;
      }
      return obj;
    }
    function hasBasic(obj) {
      obj.hasBasic = true;
      obj.has256 = false;
      obj.has16m = false;
      obj.level = 1;
      return obj;
    }
    function has256(obj) {
      obj.hasBasic = true;
      obj.has256 = true;
      obj.has16m = false;
      obj.level = 2;
      return obj;
    }
    function has16m(obj) {
      obj.hasBasic = true;
      obj.has256 = true;
      obj.has16m = true;
      obj.level = 3;
      return obj;
    }
    function colorSupport(options, obj) {
      options = options || {};
      obj = obj || {};
      if (typeof options.level === "number") {
        switch (options.level) {
          case 0:
            return hasNone(obj, options);
          case 1:
            return hasBasic(obj);
          case 2:
            return has256(obj);
          case 3:
            return has16m(obj);
        }
      }
      obj.level = 0;
      obj.hasBasic = false;
      obj.has256 = false;
      obj.has16m = false;
      if (typeof process === "undefined" || !process || !process.stdout || !process.env || !process.platform) {
        return hasNone(obj, options);
      }
      var env = options.env || process.env;
      var stream = options.stream || process.stdout;
      var term = options.term || env.TERM || "";
      var platform = options.platform || process.platform;
      if (!options.ignoreTTY && !stream.isTTY) {
        return hasNone(obj, options);
      }
      if (!options.ignoreDumb && term === "dumb" && !env.COLORTERM) {
        return hasNone(obj, options);
      }
      if (platform === "win32") {
        return hasBasic(obj);
      }
      if (env.TMUX) {
        return has256(obj);
      }
      if (!options.ignoreCI && (env.CI || env.TEAMCITY_VERSION)) {
        if (env.TRAVIS) {
          return has256(obj);
        } else {
          return hasNone(obj, options);
        }
      }
      switch (env.TERM_PROGRAM) {
        case "iTerm.app":
          var ver = env.TERM_PROGRAM_VERSION || "0.";
          if (/^[0-2]\./.test(ver)) {
            return has256(obj);
          } else {
            return has16m(obj);
          }
        case "HyperTerm":
        case "Hyper":
          return has16m(obj);
        case "MacTerm":
          return has16m(obj);
        case "Apple_Terminal":
          return has256(obj);
      }
      if (/^xterm-256/.test(term)) {
        return has256(obj);
      }
      if (/^screen|^xterm|^vt100|color|ansi|cygwin|linux/i.test(term)) {
        return hasBasic(obj);
      }
      if (env.COLORTERM) {
        return hasBasic(obj);
      }
      return hasNone(obj, options);
    }
  }
});

// node_modules/pretty-bytes/index.js
var require_pretty_bytes = __commonJS({
  "node_modules/pretty-bytes/index.js"(exports2, module2) {
    "use strict";
    var BYTE_UNITS = [
      "B",
      "kB",
      "MB",
      "GB",
      "TB",
      "PB",
      "EB",
      "ZB",
      "YB"
    ];
    var BIBYTE_UNITS = [
      "B",
      "kiB",
      "MiB",
      "GiB",
      "TiB",
      "PiB",
      "EiB",
      "ZiB",
      "YiB"
    ];
    var BIT_UNITS = [
      "b",
      "kbit",
      "Mbit",
      "Gbit",
      "Tbit",
      "Pbit",
      "Ebit",
      "Zbit",
      "Ybit"
    ];
    var BIBIT_UNITS = [
      "b",
      "kibit",
      "Mibit",
      "Gibit",
      "Tibit",
      "Pibit",
      "Eibit",
      "Zibit",
      "Yibit"
    ];
    var toLocaleString = (number, locale, options) => {
      let result = number;
      if (typeof locale === "string" || Array.isArray(locale)) {
        result = number.toLocaleString(locale, options);
      } else if (locale === true || options !== void 0) {
        result = number.toLocaleString(void 0, options);
      }
      return result;
    };
    module2.exports = (number, options) => {
      if (!Number.isFinite(number)) {
        throw new TypeError(`Expected a finite number, got ${typeof number}: ${number}`);
      }
      options = Object.assign({ bits: false, binary: false }, options);
      const UNITS = options.bits ? options.binary ? BIBIT_UNITS : BIT_UNITS : options.binary ? BIBYTE_UNITS : BYTE_UNITS;
      if (options.signed && number === 0) {
        return ` 0 ${UNITS[0]}`;
      }
      const isNegative = number < 0;
      const prefix = isNegative ? "-" : options.signed ? "+" : "";
      if (isNegative) {
        number = -number;
      }
      let localeOptions;
      if (options.minimumFractionDigits !== void 0) {
        localeOptions = { minimumFractionDigits: options.minimumFractionDigits };
      }
      if (options.maximumFractionDigits !== void 0) {
        localeOptions = Object.assign({ maximumFractionDigits: options.maximumFractionDigits }, localeOptions);
      }
      if (number < 1) {
        const numberString2 = toLocaleString(number, options.locale, localeOptions);
        return prefix + numberString2 + " " + UNITS[0];
      }
      const exponent = Math.min(Math.floor(options.binary ? Math.log(number) / Math.log(1024) : Math.log10(number) / 3), UNITS.length - 1);
      number /= Math.pow(options.binary ? 1024 : 1e3, exponent);
      if (!localeOptions) {
        number = number.toPrecision(3);
      }
      const numberString = toLocaleString(Number(number), options.locale, localeOptions);
      const unit = UNITS[exponent];
      return prefix + numberString + " " + unit;
    };
  }
});

// node_modules/hdr-histogram-js/dist/ByteBuffer.js
var require_ByteBuffer = __commonJS({
  "node_modules/hdr-histogram-js/dist/ByteBuffer.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var { pow, floor } = Math;
    var TWO_POW_32 = pow(2, 32);
    var ByteBuffer = class _ByteBuffer {
      static allocate(size = 16) {
        return new _ByteBuffer(new Uint8Array(size));
      }
      constructor(data) {
        this.position = 0;
        this.data = data;
        this.int32ArrayForConvert = new Uint32Array(1);
        this.int8ArrayForConvert = new Uint8Array(this.int32ArrayForConvert.buffer);
      }
      put(value) {
        if (this.position === this.data.length) {
          const oldArray = this.data;
          this.data = new Uint8Array(this.data.length * 2);
          this.data.set(oldArray);
        }
        this.data[this.position] = value;
        this.position++;
      }
      putInt32(value) {
        if (this.data.length - this.position < 4) {
          const oldArray = this.data;
          this.data = new Uint8Array(this.data.length * 2 + 4);
          this.data.set(oldArray);
        }
        this.int32ArrayForConvert[0] = value;
        this.data.set(this.int8ArrayForConvert.reverse(), this.position);
        this.position += 4;
      }
      putInt64(value) {
        this.putInt32(floor(value / TWO_POW_32));
        this.putInt32(value);
      }
      putArray(array) {
        if (this.data.length - this.position < array.byteLength) {
          const oldArray = this.data;
          this.data = new Uint8Array(this.position + array.byteLength);
          this.data.set(oldArray);
        }
        this.data.set(array, this.position);
        this.position += array.byteLength;
      }
      get() {
        const value = this.data[this.position];
        this.position++;
        return value;
      }
      getInt32() {
        this.int8ArrayForConvert.set(this.data.slice(this.position, this.position + 4).reverse());
        const value = this.int32ArrayForConvert[0];
        this.position += 4;
        return value;
      }
      getInt64() {
        const high = this.getInt32();
        const low = this.getInt32();
        return high * TWO_POW_32 + low;
      }
      resetPosition() {
        this.position = 0;
      }
    };
    exports2.default = ByteBuffer;
  }
});

// node_modules/hdr-histogram-js/dist/HistogramIterationValue.js
var require_HistogramIterationValue = __commonJS({
  "node_modules/hdr-histogram-js/dist/HistogramIterationValue.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var HistogramIterationValue = class {
      constructor() {
        this.reset();
      }
      reset() {
        this.valueIteratedTo = 0;
        this.valueIteratedFrom = 0;
        this.countAtValueIteratedTo = 0;
        this.countAddedInThisIterationStep = 0;
        this.totalCountToThisValue = 0;
        this.totalValueToThisValue = 0;
        this.percentile = 0;
        this.percentileLevelIteratedTo = 0;
      }
    };
    exports2.default = HistogramIterationValue;
  }
});

// node_modules/hdr-histogram-js/dist/JsHistogramIterator.js
var require_JsHistogramIterator = __commonJS({
  "node_modules/hdr-histogram-js/dist/JsHistogramIterator.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var HistogramIterationValue_1 = require_HistogramIterationValue();
    var JsHistogramIterator = class {
      constructor() {
        this.currentIterationValue = new HistogramIterationValue_1.default();
      }
      resetIterator(histogram) {
        this.histogram = histogram;
        this.savedHistogramTotalRawCount = histogram.totalCount;
        this.arrayTotalCount = histogram.totalCount;
        this.currentIndex = 0;
        this.currentValueAtIndex = 0;
        this.nextValueAtIndex = Math.pow(2, histogram.unitMagnitude);
        this.prevValueIteratedTo = 0;
        this.totalCountToPrevIndex = 0;
        this.totalCountToCurrentIndex = 0;
        this.totalValueToCurrentIndex = 0;
        this.countAtThisValue = 0;
        this.freshSubBucket = true;
        this.currentIterationValue.reset();
      }
      /**
       * Returns true if the iteration has more elements. (In other words, returns true if next would return an
       * element rather than throwing an exception.)
       *
       * @return true if the iterator has more elements.
       */
      hasNext() {
        if (this.histogram.totalCount !== this.savedHistogramTotalRawCount) {
          throw "Concurrent Modification Exception";
        }
        return this.totalCountToCurrentIndex < this.arrayTotalCount;
      }
      /**
       * Returns the next element in the iteration.
       *
       * @return the {@link HistogramIterationValue} associated with the next element in the iteration.
       */
      next() {
        while (!this.exhaustedSubBuckets()) {
          this.countAtThisValue = this.histogram.getCountAtIndex(this.currentIndex);
          if (this.freshSubBucket) {
            this.totalCountToCurrentIndex += this.countAtThisValue;
            this.totalValueToCurrentIndex += this.countAtThisValue * this.histogram.highestEquivalentValue(this.currentValueAtIndex);
            this.freshSubBucket = false;
          }
          if (this.reachedIterationLevel()) {
            const valueIteratedTo = this.getValueIteratedTo();
            Object.assign(this.currentIterationValue, {
              valueIteratedTo,
              valueIteratedFrom: this.prevValueIteratedTo,
              countAtValueIteratedTo: this.countAtThisValue,
              countAddedInThisIterationStep: this.totalCountToCurrentIndex - this.totalCountToPrevIndex,
              totalCountToThisValue: this.totalCountToCurrentIndex,
              totalValueToThisValue: this.totalValueToCurrentIndex,
              percentile: 100 * this.totalCountToCurrentIndex / this.arrayTotalCount,
              percentileLevelIteratedTo: this.getPercentileIteratedTo()
            });
            this.prevValueIteratedTo = valueIteratedTo;
            this.totalCountToPrevIndex = this.totalCountToCurrentIndex;
            this.incrementIterationLevel();
            if (this.histogram.totalCount !== this.savedHistogramTotalRawCount) {
              throw new Error("Concurrent Modification Exception");
            }
            return this.currentIterationValue;
          }
          this.incrementSubBucket();
        }
        throw new Error("Index Out Of Bounds Exception");
      }
      getPercentileIteratedTo() {
        return 100 * this.totalCountToCurrentIndex / this.arrayTotalCount;
      }
      getPercentileIteratedFrom() {
        return 100 * this.totalCountToPrevIndex / this.arrayTotalCount;
      }
      getValueIteratedTo() {
        return this.histogram.highestEquivalentValue(this.currentValueAtIndex);
      }
      exhaustedSubBuckets() {
        return this.currentIndex >= this.histogram.countsArrayLength;
      }
      incrementSubBucket() {
        this.freshSubBucket = true;
        this.currentIndex++;
        this.currentValueAtIndex = this.histogram.valueFromIndex(this.currentIndex);
        this.nextValueAtIndex = this.histogram.valueFromIndex(this.currentIndex + 1);
      }
    };
    exports2.default = JsHistogramIterator;
  }
});

// node_modules/hdr-histogram-js/dist/RecordedValuesIterator.js
var require_RecordedValuesIterator = __commonJS({
  "node_modules/hdr-histogram-js/dist/RecordedValuesIterator.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var JsHistogramIterator_1 = require_JsHistogramIterator();
    var RecordedValuesIterator = class extends JsHistogramIterator_1.default {
      /**
       * @param histogram The histogram this iterator will operate on
       */
      constructor(histogram) {
        super();
        this.doReset(histogram);
      }
      /**
       * Reset iterator for re-use in a fresh iteration over the same histogram data set.
       */
      reset() {
        this.doReset(this.histogram);
      }
      doReset(histogram) {
        super.resetIterator(histogram);
        this.visitedIndex = -1;
      }
      incrementIterationLevel() {
        this.visitedIndex = this.currentIndex;
      }
      reachedIterationLevel() {
        const currentCount = this.histogram.getCountAtIndex(this.currentIndex);
        return currentCount != 0 && this.visitedIndex !== this.currentIndex;
      }
    };
    exports2.default = RecordedValuesIterator;
  }
});

// node_modules/hdr-histogram-js/dist/PercentileIterator.js
var require_PercentileIterator = __commonJS({
  "node_modules/hdr-histogram-js/dist/PercentileIterator.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var JsHistogramIterator_1 = require_JsHistogramIterator();
    var { pow, floor, log2 } = Math;
    var PercentileIterator = class extends JsHistogramIterator_1.default {
      /**
       * @param histogram The histogram this iterator will operate on
       * @param percentileTicksPerHalfDistance The number of equal-sized iteration steps per half-distance to 100%.
       */
      constructor(histogram, percentileTicksPerHalfDistance) {
        super();
        this.percentileTicksPerHalfDistance = 0;
        this.percentileLevelToIterateTo = 0;
        this.percentileLevelToIterateFrom = 0;
        this.reachedLastRecordedValue = false;
        this.doReset(histogram, percentileTicksPerHalfDistance);
      }
      /**
       * Reset iterator for re-use in a fresh iteration over the same histogram data set.
       *
       * @param percentileTicksPerHalfDistance The number of iteration steps per half-distance to 100%.
       */
      reset(percentileTicksPerHalfDistance) {
        this.doReset(this.histogram, percentileTicksPerHalfDistance);
      }
      doReset(histogram, percentileTicksPerHalfDistance) {
        super.resetIterator(histogram);
        this.percentileTicksPerHalfDistance = percentileTicksPerHalfDistance;
        this.percentileLevelToIterateTo = 0;
        this.percentileLevelToIterateFrom = 0;
        this.reachedLastRecordedValue = false;
      }
      hasNext() {
        if (super.hasNext())
          return true;
        if (!this.reachedLastRecordedValue && this.arrayTotalCount > 0) {
          this.percentileLevelToIterateTo = 100;
          this.reachedLastRecordedValue = true;
          return true;
        }
        return false;
      }
      incrementIterationLevel() {
        this.percentileLevelToIterateFrom = this.percentileLevelToIterateTo;
        const percentileReportingTicks = this.percentileTicksPerHalfDistance * pow(2, floor(log2(100 / (100 - this.percentileLevelToIterateTo))) + 1);
        this.percentileLevelToIterateTo += 100 / percentileReportingTicks;
      }
      reachedIterationLevel() {
        if (this.countAtThisValue === 0) {
          return false;
        }
        const currentPercentile = 100 * this.totalCountToCurrentIndex / this.arrayTotalCount;
        return currentPercentile >= this.percentileLevelToIterateTo;
      }
      getPercentileIteratedTo() {
        return this.percentileLevelToIterateTo;
      }
      getPercentileIteratedFrom() {
        return this.percentileLevelToIterateFrom;
      }
    };
    exports2.default = PercentileIterator;
  }
});

// node_modules/hdr-histogram-js/dist/formatters.js
var require_formatters = __commonJS({
  "node_modules/hdr-histogram-js/dist/formatters.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.floatFormatter = exports2.keepSignificantDigits = exports2.integerFormatter = void 0;
    var leftPadding = (size) => {
      return (input) => {
        if (input.length < size) {
          return " ".repeat(size - input.length) + input;
        }
        return input;
      };
    };
    var integerFormatter = (size) => {
      const padding = leftPadding(size);
      return (integer) => padding("" + integer);
    };
    exports2.integerFormatter = integerFormatter;
    var { floor, log10, pow } = Math;
    var numberOfDigits = (n) => floor(log10(n) + 1);
    var keepSignificantDigits = (digits) => (value) => {
      const valueDigits = numberOfDigits(value);
      if (valueDigits > digits) {
        const extraDigits = valueDigits - digits;
        const magnitude = pow(10, extraDigits);
        return value - value % magnitude;
      }
      return value;
    };
    exports2.keepSignificantDigits = keepSignificantDigits;
    var floatFormatter = (size, fractionDigits) => {
      const numberFormatter = new Intl.NumberFormat("en-US", {
        maximumFractionDigits: fractionDigits,
        minimumFractionDigits: fractionDigits,
        useGrouping: false
      });
      const padding = leftPadding(size);
      return (float) => padding(numberFormatter.format(float));
    };
    exports2.floatFormatter = floatFormatter;
  }
});

// node_modules/hdr-histogram-js/dist/ulp.js
var require_ulp = __commonJS({
  "node_modules/hdr-histogram-js/dist/ulp.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var ulp = (x) => Math.pow(2, Math.floor(Math.log2(x)) - 52);
    exports2.default = ulp;
  }
});

// node_modules/hdr-histogram-js/dist/Histogram.js
var require_Histogram = __commonJS({
  "node_modules/hdr-histogram-js/dist/Histogram.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.toSummary = exports2.NO_TAG = void 0;
    var formatters_1 = require_formatters();
    exports2.NO_TAG = "NO TAG";
    var toSummary = (histogram) => {
      const { totalCount, maxValue, numberOfSignificantValueDigits } = histogram;
      const round = (0, formatters_1.keepSignificantDigits)(numberOfSignificantValueDigits);
      return {
        p50: round(histogram.getValueAtPercentile(50)),
        p75: round(histogram.getValueAtPercentile(75)),
        p90: round(histogram.getValueAtPercentile(90)),
        p97_5: round(histogram.getValueAtPercentile(97.5)),
        p99: round(histogram.getValueAtPercentile(99)),
        p99_9: round(histogram.getValueAtPercentile(99.9)),
        p99_99: round(histogram.getValueAtPercentile(99.99)),
        p99_999: round(histogram.getValueAtPercentile(99.999)),
        max: maxValue,
        totalCount
      };
    };
    exports2.toSummary = toSummary;
  }
});

// node_modules/hdr-histogram-js/dist/JsHistogram.js
var require_JsHistogram = __commonJS({
  "node_modules/hdr-histogram-js/dist/JsHistogram.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = exports2.JsHistogram = void 0;
    var RecordedValuesIterator_1 = require_RecordedValuesIterator();
    var PercentileIterator_1 = require_PercentileIterator();
    var formatters_1 = require_formatters();
    var ulp_1 = require_ulp();
    var Histogram_1 = require_Histogram();
    var { pow, floor, ceil, log2, max: max2, min } = Math;
    var JsHistogram = class _JsHistogram {
      incrementTotalCount() {
        this._totalCount++;
      }
      addToTotalCount(value) {
        this._totalCount += value;
      }
      setTotalCount(value) {
        this._totalCount = value;
      }
      /**
       * Get the total count of all recorded values in the histogram
       * @return the total count of all recorded values in the histogram
       */
      get totalCount() {
        return this._totalCount;
      }
      updatedMaxValue(value) {
        const internalValue = value + this.unitMagnitudeMask;
        this.maxValue = internalValue;
      }
      updateMinNonZeroValue(value) {
        if (value <= this.unitMagnitudeMask) {
          return;
        }
        const internalValue = floor(value / this.lowestDiscernibleValueRounded) * this.lowestDiscernibleValueRounded;
        this.minNonZeroValue = internalValue;
      }
      constructor(lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits) {
        this.autoResize = false;
        this.startTimeStampMsec = Number.MAX_SAFE_INTEGER;
        this.endTimeStampMsec = 0;
        this.tag = Histogram_1.NO_TAG;
        this.maxValue = 0;
        this.minNonZeroValue = Number.MAX_SAFE_INTEGER;
        this.identity = 0;
        this.highestTrackableValue = 0;
        this.lowestDiscernibleValue = 0;
        this.numberOfSignificantValueDigits = 0;
        this.bucketCount = 0;
        this.subBucketCount = 0;
        this.countsArrayLength = 0;
        this.wordSizeInBytes = 0;
        if (lowestDiscernibleValue < 1) {
          throw new Error("lowestDiscernibleValue must be >= 1");
        }
        if (highestTrackableValue < 2 * lowestDiscernibleValue) {
          throw new Error(`highestTrackableValue must be >= 2 * lowestDiscernibleValue ( 2 * ${lowestDiscernibleValue} )`);
        }
        if (numberOfSignificantValueDigits < 0 || numberOfSignificantValueDigits > 5) {
          throw new Error("numberOfSignificantValueDigits must be between 0 and 5");
        }
        this.identity = _JsHistogram.identityBuilder++;
        this.init(lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits);
      }
      init(lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits) {
        this.lowestDiscernibleValue = lowestDiscernibleValue;
        this.highestTrackableValue = highestTrackableValue;
        this.numberOfSignificantValueDigits = numberOfSignificantValueDigits;
        const largestValueWithSingleUnitResolution = 2 * floor(pow(10, numberOfSignificantValueDigits));
        this.unitMagnitude = floor(log2(lowestDiscernibleValue));
        this.lowestDiscernibleValueRounded = pow(2, this.unitMagnitude);
        this.unitMagnitudeMask = this.lowestDiscernibleValueRounded - 1;
        const subBucketCountMagnitude = ceil(log2(largestValueWithSingleUnitResolution));
        this.subBucketHalfCountMagnitude = (subBucketCountMagnitude > 1 ? subBucketCountMagnitude : 1) - 1;
        this.subBucketCount = pow(2, this.subBucketHalfCountMagnitude + 1);
        this.subBucketHalfCount = this.subBucketCount / 2;
        this.subBucketMask = (floor(this.subBucketCount) - 1) * pow(2, this.unitMagnitude);
        this.establishSize(highestTrackableValue);
        this.leadingZeroCountBase = 53 - this.unitMagnitude - this.subBucketHalfCountMagnitude - 1;
        this.percentileIterator = new PercentileIterator_1.default(this, 1);
        this.recordedValuesIterator = new RecordedValuesIterator_1.default(this);
      }
      /**
       * The buckets (each of which has subBucketCount sub-buckets, here assumed to be 2048 as an example) overlap:
       *
       * <pre>
       * The 0'th bucket covers from 0...2047 in multiples of 1, using all 2048 sub-buckets
       * The 1'th bucket covers from 2048..4097 in multiples of 2, using only the top 1024 sub-buckets
       * The 2'th bucket covers from 4096..8191 in multiple of 4, using only the top 1024 sub-buckets
       * ...
       * </pre>
       *
       * Bucket 0 is "special" here. It is the only one that has 2048 entries. All the rest have 1024 entries (because
       * their bottom half overlaps with and is already covered by the all of the previous buckets put together). In other
       * words, the k'th bucket could represent 0 * 2^k to 2048 * 2^k in 2048 buckets with 2^k precision, but the midpoint
       * of 1024 * 2^k = 2048 * 2^(k-1) = the k-1'th bucket's end, so we would use the previous bucket for those lower
       * values as it has better precision.
       */
      establishSize(newHighestTrackableValue) {
        this.countsArrayLength = this.determineArrayLengthNeeded(newHighestTrackableValue);
        this.bucketCount = this.getBucketsNeededToCoverValue(newHighestTrackableValue);
        this.highestTrackableValue = newHighestTrackableValue;
      }
      determineArrayLengthNeeded(highestTrackableValue) {
        if (highestTrackableValue < 2 * this.lowestDiscernibleValue) {
          throw new Error("highestTrackableValue (" + highestTrackableValue + ") cannot be < (2 * lowestDiscernibleValue)");
        }
        const countsArrayLength = this.getLengthForNumberOfBuckets(this.getBucketsNeededToCoverValue(highestTrackableValue));
        return countsArrayLength;
      }
      /**
       * If we have N such that subBucketCount * 2^N > max value, we need storage for N+1 buckets, each with enough
       * slots to hold the top half of the subBucketCount (the lower half is covered by previous buckets), and the +1
       * being used for the lower half of the 0'th bucket. Or, equivalently, we need 1 more bucket to capture the max
       * value if we consider the sub-bucket length to be halved.
       */
      getLengthForNumberOfBuckets(numberOfBuckets) {
        const lengthNeeded = (numberOfBuckets + 1) * (this.subBucketCount / 2);
        return lengthNeeded;
      }
      getBucketsNeededToCoverValue(value) {
        let smallestUntrackableValue = this.subBucketCount * pow(2, this.unitMagnitude);
        let bucketsNeeded = 1;
        while (smallestUntrackableValue <= value) {
          if (smallestUntrackableValue > Number.MAX_SAFE_INTEGER / 2) {
            return bucketsNeeded + 1;
          }
          smallestUntrackableValue = smallestUntrackableValue * 2;
          bucketsNeeded++;
        }
        return bucketsNeeded;
      }
      /**
       * Record a value in the histogram
       *
       * @param value The value to be recorded
       * @throws may throw Error if value is exceeds highestTrackableValue
       */
      recordValue(value) {
        this.recordSingleValue(value);
      }
      recordSingleValue(value) {
        const countsIndex = this.countsArrayIndex(value);
        if (countsIndex >= this.countsArrayLength) {
          this.handleRecordException(1, value);
        } else {
          this.incrementCountAtIndex(countsIndex);
        }
        this.updateMinAndMax(value);
        this.incrementTotalCount();
      }
      handleRecordException(count, value) {
        if (!this.autoResize) {
          throw new Error("Value " + value + " is outside of histogram covered range");
        }
        this.resize(value);
        var countsIndex = this.countsArrayIndex(value);
        this.addToCountAtIndex(countsIndex, count);
        this.highestTrackableValue = this.highestEquivalentValue(this.valueFromIndex(this.countsArrayLength - 1));
      }
      countsArrayIndex(value) {
        if (value < 0) {
          throw new Error("Histogram recorded value cannot be negative.");
        }
        const bucketIndex = this.getBucketIndex(value);
        const subBucketIndex = this.getSubBucketIndex(value, bucketIndex);
        return this.computeCountsArrayIndex(bucketIndex, subBucketIndex);
      }
      computeCountsArrayIndex(bucketIndex, subBucketIndex) {
        const bucketBaseIndex = (bucketIndex + 1) * pow(2, this.subBucketHalfCountMagnitude);
        const offsetInBucket = subBucketIndex - this.subBucketHalfCount;
        return bucketBaseIndex + offsetInBucket;
      }
      /**
       * @return the lowest (and therefore highest precision) bucket index that can represent the value
       */
      getBucketIndex(value) {
        return max2(floor(log2(value)) - this.subBucketHalfCountMagnitude - this.unitMagnitude, 0);
      }
      getSubBucketIndex(value, bucketIndex) {
        return floor(value / pow(2, bucketIndex + this.unitMagnitude));
      }
      updateMinAndMax(value) {
        if (value > this.maxValue) {
          this.updatedMaxValue(value);
        }
        if (value < this.minNonZeroValue && value !== 0) {
          this.updateMinNonZeroValue(value);
        }
      }
      /**
       * Get the value at a given percentile.
       * When the given percentile is &gt; 0.0, the value returned is the value that the given
       * percentage of the overall recorded value entries in the histogram are either smaller than
       * or equivalent to. When the given percentile is 0.0, the value returned is the value that all value
       * entries in the histogram are either larger than or equivalent to.
       * <p>
       * Note that two values are "equivalent" in this statement if
       * {@link org.HdrHistogram.JsHistogram#valuesAreEquivalent} would return true.
       *
       * @param percentile  The percentile for which to return the associated value
       * @return The value that the given percentage of the overall recorded value entries in the
       * histogram are either smaller than or equivalent to. When the percentile is 0.0, returns the
       * value that all value entries in the histogram are either larger than or equivalent to.
       */
      getValueAtPercentile(percentile) {
        const requestedPercentile = min(percentile, 100);
        const fpCountAtPercentile = requestedPercentile / 100 * this.totalCount;
        const countAtPercentile = max2(
          ceil(fpCountAtPercentile - (0, ulp_1.default)(fpCountAtPercentile)),
          // round up
          1
          // Make sure we at least reach the first recorded entry
        );
        let totalToCurrentIndex = 0;
        for (let i = 0; i < this.countsArrayLength; i++) {
          totalToCurrentIndex += this.getCountAtIndex(i);
          if (totalToCurrentIndex >= countAtPercentile) {
            var valueAtIndex = this.valueFromIndex(i);
            return percentile === 0 ? this.lowestEquivalentValue(valueAtIndex) : this.highestEquivalentValue(valueAtIndex);
          }
        }
        return 0;
      }
      valueFromIndexes(bucketIndex, subBucketIndex) {
        return subBucketIndex * pow(2, bucketIndex + this.unitMagnitude);
      }
      valueFromIndex(index) {
        let bucketIndex = floor(index / this.subBucketHalfCount) - 1;
        let subBucketIndex = index % this.subBucketHalfCount + this.subBucketHalfCount;
        if (bucketIndex < 0) {
          subBucketIndex -= this.subBucketHalfCount;
          bucketIndex = 0;
        }
        return this.valueFromIndexes(bucketIndex, subBucketIndex);
      }
      /**
       * Get the lowest value that is equivalent to the given value within the histogram's resolution.
       * Where "equivalent" means that value samples recorded for any two
       * equivalent values are counted in a common total count.
       *
       * @param value The given value
       * @return The lowest value that is equivalent to the given value within the histogram's resolution.
       */
      lowestEquivalentValue(value) {
        const bucketIndex = this.getBucketIndex(value);
        const subBucketIndex = this.getSubBucketIndex(value, bucketIndex);
        const thisValueBaseLevel = this.valueFromIndexes(bucketIndex, subBucketIndex);
        return thisValueBaseLevel;
      }
      /**
       * Get the highest value that is equivalent to the given value within the histogram's resolution.
       * Where "equivalent" means that value samples recorded for any two
       * equivalent values are counted in a common total count.
       *
       * @param value The given value
       * @return The highest value that is equivalent to the given value within the histogram's resolution.
       */
      highestEquivalentValue(value) {
        return this.nextNonEquivalentValue(value) - 1;
      }
      /**
       * Get the next value that is not equivalent to the given value within the histogram's resolution.
       * Where "equivalent" means that value samples recorded for any two
       * equivalent values are counted in a common total count.
       *
       * @param value The given value
       * @return The next value that is not equivalent to the given value within the histogram's resolution.
       */
      nextNonEquivalentValue(value) {
        return this.lowestEquivalentValue(value) + this.sizeOfEquivalentValueRange(value);
      }
      /**
       * Get the size (in value units) of the range of values that are equivalent to the given value within the
       * histogram's resolution. Where "equivalent" means that value samples recorded for any two
       * equivalent values are counted in a common total count.
       *
       * @param value The given value
       * @return The size of the range of values equivalent to the given value.
       */
      sizeOfEquivalentValueRange(value) {
        const bucketIndex = this.getBucketIndex(value);
        const subBucketIndex = this.getSubBucketIndex(value, bucketIndex);
        const distanceToNextValue = pow(2, this.unitMagnitude + (subBucketIndex >= this.subBucketCount ? bucketIndex + 1 : bucketIndex));
        return distanceToNextValue;
      }
      /**
       * Get a value that lies in the middle (rounded up) of the range of values equivalent the given value.
       * Where "equivalent" means that value samples recorded for any two
       * equivalent values are counted in a common total count.
       *
       * @param value The given value
       * @return The value lies in the middle (rounded up) of the range of values equivalent the given value.
       */
      medianEquivalentValue(value) {
        return this.lowestEquivalentValue(value) + floor(this.sizeOfEquivalentValueRange(value) / 2);
      }
      /**
       * Get the computed mean value of all recorded values in the histogram
       *
       * @return the mean value (in value units) of the histogram data
       */
      get mean() {
        if (this.totalCount === 0) {
          return 0;
        }
        this.recordedValuesIterator.reset();
        let totalValue = 0;
        while (this.recordedValuesIterator.hasNext()) {
          const iterationValue = this.recordedValuesIterator.next();
          totalValue += this.medianEquivalentValue(iterationValue.valueIteratedTo) * iterationValue.countAtValueIteratedTo;
        }
        return totalValue / this.totalCount;
      }
      getStdDeviation(mean = this.mean) {
        if (this.totalCount === 0) {
          return 0;
        }
        let geometric_deviation_total = 0;
        this.recordedValuesIterator.reset();
        while (this.recordedValuesIterator.hasNext()) {
          const iterationValue = this.recordedValuesIterator.next();
          const deviation = this.medianEquivalentValue(iterationValue.valueIteratedTo) - mean;
          geometric_deviation_total += deviation * deviation * iterationValue.countAddedInThisIterationStep;
        }
        const std_deviation = Math.sqrt(geometric_deviation_total / this.totalCount);
        return std_deviation;
      }
      /**
       * Get the computed standard deviation of all recorded values in the histogram
       *
       * @return the standard deviation (in value units) of the histogram data
       */
      get stdDeviation() {
        if (this.totalCount === 0) {
          return 0;
        }
        const mean = this.mean;
        let geometric_deviation_total = 0;
        this.recordedValuesIterator.reset();
        while (this.recordedValuesIterator.hasNext()) {
          const iterationValue = this.recordedValuesIterator.next();
          const deviation = this.medianEquivalentValue(iterationValue.valueIteratedTo) - mean;
          geometric_deviation_total += deviation * deviation * iterationValue.countAddedInThisIterationStep;
        }
        const std_deviation = Math.sqrt(geometric_deviation_total / this.totalCount);
        return std_deviation;
      }
      /**
       * Produce textual representation of the value distribution of histogram data by percentile. The distribution is
       * output with exponentially increasing resolution, with each exponentially decreasing half-distance containing
       * <i>dumpTicksPerHalf</i> percentile reporting tick points.
       *
       * @param printStream    Stream into which the distribution will be output
       * <p>
       * @param percentileTicksPerHalfDistance  The number of reporting points per exponentially decreasing half-distance
       * <p>
       * @param outputValueUnitScalingRatio    The scaling factor by which to divide histogram recorded values units in
       *                                     output
       * @param useCsvFormat  Output in CSV format if true. Otherwise use plain text form.
       */
      outputPercentileDistribution(percentileTicksPerHalfDistance = 5, outputValueUnitScalingRatio = 1, useCsvFormat = false) {
        let result = "";
        if (useCsvFormat) {
          result += '"Value","Percentile","TotalCount","1/(1-Percentile)"\n';
        } else {
          result += "       Value     Percentile TotalCount 1/(1-Percentile)\n\n";
        }
        const iterator = this.percentileIterator;
        iterator.reset(percentileTicksPerHalfDistance);
        let lineFormatter;
        let lastLineFormatter;
        if (useCsvFormat) {
          const valueFormatter = (0, formatters_1.floatFormatter)(0, this.numberOfSignificantValueDigits);
          const percentileFormatter = (0, formatters_1.floatFormatter)(0, 12);
          const lastFormatter = (0, formatters_1.floatFormatter)(0, 2);
          lineFormatter = (iterationValue) => valueFormatter(iterationValue.valueIteratedTo / outputValueUnitScalingRatio) + "," + percentileFormatter(iterationValue.percentileLevelIteratedTo / 100) + "," + iterationValue.totalCountToThisValue + "," + lastFormatter(1 / (1 - iterationValue.percentileLevelIteratedTo / 100)) + "\n";
          lastLineFormatter = (iterationValue) => valueFormatter(iterationValue.valueIteratedTo / outputValueUnitScalingRatio) + "," + percentileFormatter(iterationValue.percentileLevelIteratedTo / 100) + "," + iterationValue.totalCountToThisValue + ",Infinity\n";
        } else {
          const valueFormatter = (0, formatters_1.floatFormatter)(12, this.numberOfSignificantValueDigits);
          const percentileFormatter = (0, formatters_1.floatFormatter)(2, 12);
          const totalCountFormatter = (0, formatters_1.integerFormatter)(10);
          const lastFormatter = (0, formatters_1.floatFormatter)(14, 2);
          lineFormatter = (iterationValue) => valueFormatter(iterationValue.valueIteratedTo / outputValueUnitScalingRatio) + " " + percentileFormatter(iterationValue.percentileLevelIteratedTo / 100) + " " + totalCountFormatter(iterationValue.totalCountToThisValue) + " " + lastFormatter(1 / (1 - iterationValue.percentileLevelIteratedTo / 100)) + "\n";
          lastLineFormatter = (iterationValue) => valueFormatter(iterationValue.valueIteratedTo / outputValueUnitScalingRatio) + " " + percentileFormatter(iterationValue.percentileLevelIteratedTo / 100) + " " + totalCountFormatter(iterationValue.totalCountToThisValue) + "\n";
        }
        while (iterator.hasNext()) {
          const iterationValue = iterator.next();
          if (iterationValue.percentileLevelIteratedTo < 100) {
            result += lineFormatter(iterationValue);
          } else {
            result += lastLineFormatter(iterationValue);
          }
        }
        if (!useCsvFormat) {
          const formatter = (0, formatters_1.floatFormatter)(12, this.numberOfSignificantValueDigits);
          const _mean = this.mean;
          const mean = formatter(_mean / outputValueUnitScalingRatio);
          const std_deviation = formatter(this.getStdDeviation(_mean) / outputValueUnitScalingRatio);
          const max3 = formatter(this.maxValue / outputValueUnitScalingRatio);
          const intFormatter = (0, formatters_1.integerFormatter)(12);
          const totalCount = intFormatter(this.totalCount);
          const bucketCount = intFormatter(this.bucketCount);
          const subBucketCount = intFormatter(this.subBucketCount);
          result += `#[Mean    = ${mean}, StdDeviation   = ${std_deviation}]
#[Max     = ${max3}, Total count    = ${totalCount}]
#[Buckets = ${bucketCount}, SubBuckets     = ${subBucketCount}]
`;
        }
        return result;
      }
      get summary() {
        return (0, Histogram_1.toSummary)(this);
      }
      toJSON() {
        return this.summary;
      }
      inspect() {
        return this.toString();
      }
      [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")]() {
        return this.toString();
      }
      /**
       * Provide a (conservatively high) estimate of the Histogram's total footprint in bytes
       *
       * @return a (conservatively high) estimate of the Histogram's total footprint in bytes
       */
      get estimatedFootprintInBytes() {
        return this._getEstimatedFootprintInBytes();
      }
      recordSingleValueWithExpectedInterval(value, expectedIntervalBetweenValueSamples) {
        this.recordSingleValue(value);
        if (expectedIntervalBetweenValueSamples <= 0) {
          return;
        }
        for (let missingValue = value - expectedIntervalBetweenValueSamples; missingValue >= expectedIntervalBetweenValueSamples; missingValue -= expectedIntervalBetweenValueSamples) {
          this.recordSingleValue(missingValue);
        }
      }
      recordCountAtValue(count, value) {
        const countsIndex = this.countsArrayIndex(value);
        if (countsIndex >= this.countsArrayLength) {
          this.handleRecordException(count, value);
        } else {
          this.addToCountAtIndex(countsIndex, count);
        }
        this.updateMinAndMax(value);
        this.addToTotalCount(count);
      }
      /**
       * Record a value in the histogram (adding to the value's current count)
       *
       * @param value The value to be recorded
       * @param count The number of occurrences of this value to record
       * @throws ArrayIndexOutOfBoundsException (may throw) if value is exceeds highestTrackableValue
       */
      recordValueWithCount(value, count) {
        this.recordCountAtValue(count, value);
      }
      /**
       * Record a value in the histogram.
       * <p>
       * To compensate for the loss of sampled values when a recorded value is larger than the expected
       * interval between value samples, Histogram will auto-generate an additional series of decreasingly-smaller
       * (down to the expectedIntervalBetweenValueSamples) value records.
       * <p>
       * Note: This is a at-recording correction method, as opposed to the post-recording correction method provided
       * by {@link #copyCorrectedForCoordinatedOmission(long)}.
       * The two methods are mutually exclusive, and only one of the two should be be used on a given data set to correct
       * for the same coordinated omission issue.
       * <p>
       * See notes in the description of the Histogram calls for an illustration of why this corrective behavior is
       * important.
       *
       * @param value The value to record
       * @param expectedIntervalBetweenValueSamples If expectedIntervalBetweenValueSamples is larger than 0, add
       *                                           auto-generated value records as appropriate if value is larger
       *                                           than expectedIntervalBetweenValueSamples
       * @throws ArrayIndexOutOfBoundsException (may throw) if value is exceeds highestTrackableValue
       */
      recordValueWithExpectedInterval(value, expectedIntervalBetweenValueSamples) {
        this.recordSingleValueWithExpectedInterval(value, expectedIntervalBetweenValueSamples);
      }
      recordValueWithCountAndExpectedInterval(value, count, expectedIntervalBetweenValueSamples) {
        this.recordCountAtValue(count, value);
        if (expectedIntervalBetweenValueSamples <= 0) {
          return;
        }
        for (let missingValue = value - expectedIntervalBetweenValueSamples; missingValue >= expectedIntervalBetweenValueSamples; missingValue -= expectedIntervalBetweenValueSamples) {
          this.recordCountAtValue(count, missingValue);
        }
      }
      /**
       * Add the contents of another histogram to this one, while correcting the incoming data for coordinated omission.
       * <p>
       * To compensate for the loss of sampled values when a recorded value is larger than the expected
       * interval between value samples, the values added will include an auto-generated additional series of
       * decreasingly-smaller (down to the expectedIntervalBetweenValueSamples) value records for each count found
       * in the current histogram that is larger than the expectedIntervalBetweenValueSamples.
       *
       * Note: This is a post-recording correction method, as opposed to the at-recording correction method provided
       * by {@link #recordValueWithExpectedInterval(long, long) recordValueWithExpectedInterval}. The two
       * methods are mutually exclusive, and only one of the two should be be used on a given data set to correct
       * for the same coordinated omission issue.
       * by
       * <p>
       * See notes in the description of the Histogram calls for an illustration of why this corrective behavior is
       * important.
       *
       * @param otherHistogram The other histogram. highestTrackableValue and largestValueWithSingleUnitResolution must match.
       * @param expectedIntervalBetweenValueSamples If expectedIntervalBetweenValueSamples is larger than 0, add
       *                                           auto-generated value records as appropriate if value is larger
       *                                           than expectedIntervalBetweenValueSamples
       * @throws ArrayIndexOutOfBoundsException (may throw) if values exceed highestTrackableValue
       */
      addWhileCorrectingForCoordinatedOmission(otherHistogram, expectedIntervalBetweenValueSamples) {
        const toHistogram = this;
        const otherValues = new RecordedValuesIterator_1.default(otherHistogram);
        while (otherValues.hasNext()) {
          const v = otherValues.next();
          toHistogram.recordValueWithCountAndExpectedInterval(v.valueIteratedTo, v.countAtValueIteratedTo, expectedIntervalBetweenValueSamples);
        }
      }
      /**
       * Add the contents of another histogram to this one.
       * <p>
       * As part of adding the contents, the start/end timestamp range of this histogram will be
       * extended to include the start/end timestamp range of the other histogram.
       *
       * @param otherHistogram The other histogram.
       * @throws (may throw) if values in fromHistogram's are
       * higher than highestTrackableValue.
       */
      add(otherHistogram) {
        if (!(otherHistogram instanceof _JsHistogram)) {
          throw new Error("Cannot add a WASM histogram to a regular JS histogram");
        }
        const highestRecordableValue = this.highestEquivalentValue(this.valueFromIndex(this.countsArrayLength - 1));
        if (highestRecordableValue < otherHistogram.maxValue) {
          if (!this.autoResize) {
            throw new Error("The other histogram includes values that do not fit in this histogram's range.");
          }
          this.resize(otherHistogram.maxValue);
        }
        if (this.bucketCount === otherHistogram.bucketCount && this.subBucketCount === otherHistogram.subBucketCount && this.unitMagnitude === otherHistogram.unitMagnitude) {
          let observedOtherTotalCount = 0;
          for (let i = 0; i < otherHistogram.countsArrayLength; i++) {
            const otherCount = otherHistogram.getCountAtIndex(i);
            if (otherCount > 0) {
              this.addToCountAtIndex(i, otherCount);
              observedOtherTotalCount += otherCount;
            }
          }
          this.setTotalCount(this.totalCount + observedOtherTotalCount);
          this.updatedMaxValue(max2(this.maxValue, otherHistogram.maxValue));
          this.updateMinNonZeroValue(min(this.minNonZeroValue, otherHistogram.minNonZeroValue));
        } else {
          const otherMaxIndex = otherHistogram.countsArrayIndex(otherHistogram.maxValue);
          let otherCount = otherHistogram.getCountAtIndex(otherMaxIndex);
          this.recordCountAtValue(otherCount, otherHistogram.valueFromIndex(otherMaxIndex));
          for (let i = 0; i < otherMaxIndex; i++) {
            otherCount = otherHistogram.getCountAtIndex(i);
            if (otherCount > 0) {
              this.recordCountAtValue(otherCount, otherHistogram.valueFromIndex(i));
            }
          }
        }
        this.startTimeStampMsec = min(this.startTimeStampMsec, otherHistogram.startTimeStampMsec);
        this.endTimeStampMsec = max2(this.endTimeStampMsec, otherHistogram.endTimeStampMsec);
      }
      /**
       * Get the count of recorded values at a specific value (to within the histogram resolution at the value level).
       *
       * @param value The value for which to provide the recorded count
       * @return The total count of values recorded in the histogram within the value range that is
       * {@literal >=} lowestEquivalentValue(<i>value</i>) and {@literal <=} highestEquivalentValue(<i>value</i>)
       */
      getCountAtValue(value) {
        const index = min(max2(0, this.countsArrayIndex(value)), this.countsArrayLength - 1);
        return this.getCountAtIndex(index);
      }
      /**
       * Subtract the contents of another histogram from this one.
       * <p>
       * The start/end timestamps of this histogram will remain unchanged.
       *
       * @param otherHistogram The other histogram.
       * @throws ArrayIndexOutOfBoundsException (may throw) if values in otherHistogram's are higher than highestTrackableValue.
       *
       */
      subtract(otherHistogram) {
        const highestRecordableValue = this.valueFromIndex(this.countsArrayLength - 1);
        if (!(otherHistogram instanceof _JsHistogram)) {
          throw new Error("Cannot subtract a WASM histogram to a regular JS histogram");
        }
        if (highestRecordableValue < otherHistogram.maxValue) {
          if (!this.autoResize) {
            throw new Error("The other histogram includes values that do not fit in this histogram's range.");
          }
          this.resize(otherHistogram.maxValue);
        }
        if (this.bucketCount === otherHistogram.bucketCount && this.subBucketCount === otherHistogram.subBucketCount && this.unitMagnitude === otherHistogram.unitMagnitude) {
          let observedOtherTotalCount = 0;
          for (let i = 0; i < otherHistogram.countsArrayLength; i++) {
            const otherCount = otherHistogram.getCountAtIndex(i);
            if (otherCount > 0) {
              this.addToCountAtIndex(i, -otherCount);
              observedOtherTotalCount += otherCount;
            }
          }
          this.setTotalCount(this.totalCount - observedOtherTotalCount);
        } else {
          for (let i = 0; i < otherHistogram.countsArrayLength; i++) {
            const otherCount = otherHistogram.getCountAtIndex(i);
            if (otherCount > 0) {
              const otherValue = otherHistogram.valueFromIndex(i);
              if (this.getCountAtValue(otherValue) < otherCount) {
                throw new Error("otherHistogram count (" + otherCount + ") at value " + otherValue + " is larger than this one's (" + this.getCountAtValue(otherValue) + ")");
              }
              this.recordCountAtValue(-otherCount, otherValue);
            }
          }
        }
        if (this.getCountAtValue(this.maxValue) <= 0 || this.getCountAtValue(this.minNonZeroValue) <= 0) {
          this.establishInternalTackingValues();
        }
      }
      establishInternalTackingValues(lengthToCover = this.countsArrayLength) {
        this.maxValue = 0;
        this.minNonZeroValue = Number.MAX_VALUE;
        let maxIndex = -1;
        let minNonZeroIndex = -1;
        let observedTotalCount = 0;
        for (let index = 0; index < lengthToCover; index++) {
          const countAtIndex = this.getCountAtIndex(index);
          if (countAtIndex > 0) {
            observedTotalCount += countAtIndex;
            maxIndex = index;
            if (minNonZeroIndex == -1 && index != 0) {
              minNonZeroIndex = index;
            }
          }
        }
        if (maxIndex >= 0) {
          this.updatedMaxValue(this.highestEquivalentValue(this.valueFromIndex(maxIndex)));
        }
        if (minNonZeroIndex >= 0) {
          this.updateMinNonZeroValue(this.valueFromIndex(minNonZeroIndex));
        }
        this.setTotalCount(observedTotalCount);
      }
      reset() {
        this.clearCounts();
        this.setTotalCount(0);
        this.startTimeStampMsec = 0;
        this.endTimeStampMsec = 0;
        this.tag = Histogram_1.NO_TAG;
        this.maxValue = 0;
        this.minNonZeroValue = Number.MAX_SAFE_INTEGER;
      }
      destroy() {
      }
    };
    exports2.JsHistogram = JsHistogram;
    exports2.default = JsHistogram;
  }
});

// node_modules/hdr-histogram-js/dist/wasm/generated-wasm.js
var require_generated_wasm = __commonJS({
  "node_modules/hdr-histogram-js/dist/wasm/generated-wasm.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.BINARY = void 0;
    exports2.BINARY = "eNrsfQtgVMXV/8zce3c3uQlclLBIUGdvogQRCUkIQbGbmwKiVaGWWoqvBAjCBoGEBW2/kARRxFelL6vV6iZU8bNY8bOtQsWAWkVbLb79V9uC9VU/W6m11bZ+5u85M/fu3VeygbxdabO798ydmXvmnDNnzpz5XVKz+hJKCKH302OqWXMzqabNtBn+NFbTZgKXaHM1a27Ev00EvzZWe5obGxuRpDQ3NpJqpbkZCzeSagp0pVmUbaLN1WpzU1MzqVaamkT5piYsL2ukTVgFba4mpJrgtWbaBB1oqlabsVoKtbBGqBev0OZqrRlJLJcqtSvWajULVzaEyVHKn9nbLCdPISQ7b5RK1Ozso9TsMfnZNMeTTYYrHkXxU5UQouZSv0I9wz2K+B8lZLia61FUv0qVPEVR8tRhhjKaMq8ndwQZTbVhR2gE7stW1bHkSIL/0VGEeIghClFRwKZ156oKl+nRiYTRw+A/lY6iPkpVSvGPT/7P56OE6fgP/9Ozsrwjxe2id4qvl65q8J+Srap0FVE1hRLq2URHNdIZdhG9mVqH8sddRUx1xPLCHx/8GQl/xsKfQvhzIvzZvZFCDdddw3TvJyc9QHO/evrZ8yqsc86xvn7R6TOUYdmzl60Or7y4oeaSCmW47vyYXK4Y0V+lJcqI6K/yMuWI4XNrFtXVLnauKUdqF120ovZSomsXXbRq2QoS9F500ZoV8K0y66KLFq1cvrx2UZhY+kUXNYTDyy5aWLO6VhnpuaT2kpUN32Bk5EUXra4NWw0Xr7mkdkV49Zm1Ky4OLyUzRkU7V7Bo5YrV4YY1i8IrG8g79CgX5eLa8Mk1a8Irz6ldveybteTPMcTVscR3aWHcnUuXXby0dnV4XkPNorqahctrz61ZvqaW/G9MudUpy71HA3H1rQ7XNITnLbuk9ivhmktWnbW6dhH5S0yh1ckL/ZUeG1dT7YrFsUXejymyOlmRg/SYuFouWbbi7JUrFtQ2rBQ9/hv1x5eouUyQPkhga3hluGb5F1euWREmf6f5CU+6eEbt2mU14WUrV5AP6ZHx1dbWrCD/oEXxT7U6vOySmnDt4lkrV4ZXNSxbET59RdU3wrWryT+pe7wbahetbFgsOvZRzIO7KF9bFl4quvcxPSF1kZmXrapdFK5dfPqKcG3D2prl5F/xzMaiVnhubcOi2hXhZctryb/pOFeRlWvCq9a4yDOWrQ43LFu4Bp/9P/SkGEFd9Y0vrmxowBZnrWz44sqVDYuXrYBHnnPJstWr4Y5P6GjXHTWLo4pUQf4vZhTctMnl5NOUxNIS0pGSWF5GWtjRscQ4DSbrYwqsXrMw3FCzKOzq2OXsmM4KTC4nGzovUVpCrui8RHkZuZKZSUrEd3YjG+EqVbti0crFteQqZsTIwOraMNnE/K4exliRq9kYNynBjMRQE+zIcfH3pjIkx8VXk8qSmPE1JjUlZnx1SW0Jj68riTHh8TUlsSbHxteTaE5GJxSJ2pMEBscYlLGJD+yyKNewkQk1g0m5lo1PeLiUNuW62OF3G5XrGU9BilqVb7EJnZRJMCs3sHi+J9qVzazIXaZTw/JtNilWeLu2LN9hR7lviTUt342V+Djb8r3U1NIS8v3U1PIycqNLrwU1XmN/EFsiiX25iR3baYnJ5eTmLoqUlpAfdlGkvIzcwgqSFYnv8a3sCHcxaWR+5LI8KBJgZW5ziVlpSYyVud3Ft9KSzqxMaUlnVkbe27WVkdV0bWVkjV1YGVldF1ZG1tWplZE1dWplZD2dWRm7SDIrI2kprIzzwC4rE3FZGbtmsDKtLitjP1xKK9MWO/xuK7OF8RSkqJX5scvKJJZJsDJ3sHi+J1qZO11WprSkcyuz1WVlUHi7tjJ3uaxMaUmclfnvWImPszJ3p6aWlpCfpKaWl5FtLhsiqPE6e09siSRW5qfs2E5LTC4n93ZRpLSEbO+iSHkZuc9lZVxF4nv8Py4rU1piW5n7XVYGRQKszM9cYlZeFmNlfu7iW3lZZ1amvKwzKyPv7drKyGq6tjKyxi6sjKyuCysj6+rUysiaOrUysp7OrIxdJJmVkbQUVsZ5YJeV+YXLytg1g5V5wGVl7IdLaWUejB1+t5XZwXgKUtTK7HRZmcQyCVbmlyye74lW5iGXlSkv69zK7HJZGRTerq3Mwy4rU14WZ2XaYyU+zsrsTk0tLSF7UlPLy8gjLhsiqPE6+2hsiSRW5jF2bKclJpeTX3VRpLSEPN5FkfIy8oTLyriKxPd4r8vKlJfZVuZJl5VBkQAr8xTLj7s7xtL8mh0TT06wNgklEizO+GR1pLI645NVl8ryHJ+s5qTW5/hk1Sa1QIXJ6kxihQqT1ZjEEhUkqy/RGo1NWixqkZIORIxV4smZ4bJMv2Gjk7YC1ulpNjHpg6e0UM8kio7bSv2WFXZCjlqqfWxSF+USrNWzLNkYJVqs59iJ8eU6tVrPs9JEZejacr3Ajo6/LdZ6vZioRXEW7KXOS5SWkJc7L1FeRl5hZpIS8bbh/yWWSmLRfscKuiw1uZy8mkax0hLyWhrFysvI79m4VMXin+IPbFR8UWnl/sjyEsUJLN1+ZiyuhSKuxzzARsRdm1xOXk+4WFpC/pRwsbyMvMHyxMX47r3JfHRmVhYlFtUVOuu07B884nub5RJOONlVRa9sb71Zv4SyZiuSbbzFrM058He/D/7uu5LipY34ETkC/u4eg9+RvnkfMd5iBZpJi5hqNdYHiFLJCaenqZWcFDF1DCfWyJDxRfyB9Byq6/ouSpXmAg8ns0Q5X6FHZ5V2IZPOlJfH5FCdU/xqsnLm44wzKKPUc9pQzlS9wBtgQM4xqUXPUpstqsG2QxEjnJ6uVlqRbGt/tjXKGmsQonNqKWHrsY00VMSIxev1gALV+QKUE84KfDMtxpV8qBceAZqjnMrmCF5mnJQzn/40pWozkAj0VrFa2OlqM1csda1mHcsV65OOjg7F/jw931QurjNVy1sXYFzhqqXWrbWM1dA6hdZVbMTU1EqucRXq56payVWuwRNyhTNLDYcsFuYkVMSqOQWmxVyFu6q5Clxj4ooYjyauXFoPzXAFeq8gW4FdxGri7NL6ckZ0Xdd/yagmHsdkUNpSQ5xZjfUhU8VrFq3HG1VDhaqiZKUc+Ay/JS/EHQGmc8VicBO11DqoA+gBD7AV6/DAPYpTh85V6HgDVAfsAeYTpJtMMpdJ5jLJXOYwl11cZyrAXI0z6Jxgrsm4FsM2fDACbEBu+LiCXKTI45jCcK3a5hPlWhj7pUnGEiGllLMwSuBVlFLo3qp61gykSM5nfSaccWodGbJW1VtqnUkto25WPowOsAE6YtQFQLL1OpNZI09XK4fryFlWz5nlg4u0oUEwV3QZPnxYqRoKmcxiQCSclbNIDnJV02+klDUHiUktciYoAqd1lcQiszWL6Gol0a3N1zCohljbbxRfQFUt/+kwthYLAz2EzVkkQBUYOwNolBPJG6dENacWDQUo6DIn8BXVGlv42Y0sSCwjbHjgZ2G2/qhClWZWKf4VKMMUQpmiW7RQsUiharACb6GnQB2uF/hmBliBJ2pHCrycoB0p9AieK/Wc4QXObFPRgN0tVKWZgXpiTY3dhl3xLLWyIE9YKdiYPF0YGmJSeFLjLQbPo8rnSdqZTjoiOxHXg4KsACnwFmZxUujlrNBnUws9FitUdHx0j0kKvE71QHN1T4gAfvi0AirksrHeUkN1hTg4IRMLz1ErC7JnqpWGFx+iDsyaNbzeopzko2UUWkrr9THCsBELjCgpyEb50a3s4XqBFwRcWEBozyKFim4R/Q4Qrs/EUCgjFcpoUSuf04vrwpyGLFoHlVqfdnR00NPzTWprJRMmQ5o8ahsoeM5mTsP1JprSpXFGThNPCYpFQ7IQCDxdaoKswu1LHbnEGywwZS8xSptZJaczYXazyMkEbwKNoXXiJ7XYWTaRig8GnZJkZilOQY9TEK2tc90nr3NSZyn1JgP+E6GQlLM6nMGgSbhDKLF9R3QgObNyJBk03i442imYIz4M8TFSfIzmzBrr3Dba+TbS+WbU2V0hllpvjQ6ZLBQQ/ZJKzeeAUFWRqQoRHz7xYYiP0VBEyA6XeqDrf1NghiDWe2Bz56iV1n6fFcmyrmDWsTCxFtACkD5WabUYAaZUcmb46gKsACacAnpP1V7aVPUGadlqtfhChSyH6ZxZ5IxcuNFkBZ+xvsV3upUd5ixUyHTdFuKC7IDCiWUAK9HYf0k0vF23nlKso3FGV6wczhxDC0w9K9/UjCyTzVQrgzB3qVwBowysCVtq3WlhlFrt4rowiKwW4hrXbKkNWR0dSshqaWmst4y1Jsz36hn5aEVhQpZfiC4mZSMsDR1XuGZkwawH9n0MEA0Vv5seq7GeazD7G8B2xj1g4zUxo4BQhUKmhnOe0EWsStOwYFO9GFKYbu3pVYGnIdY6nLphPgBBQa/EKMgy0Z1QwJUR7hFMiDjVwV3CbDWIGRCcqQJq1wvdKATVHBkyKSdGNqf6L7Op0owCo9TDfAbTFzEVNPacmipOAODOTCRScWhdgMkZQamfqVaCHIjHJmhtpIYUMVV6WEXMB73DbznwINQyQih5BjQCwixrZJavPkU91PKJe3yhALDEUmNLwowZoNKqA51J+iRKTqFoDwSdSbp0dqh4Ln04XOMo3eIfPp5F6+REhg0FtOgd4hsV1oWFHJbB9yRcU+qExlgjHE5RU7F8Ya5Zo9c2OA+rmSpcVMRFyb8sUVIVFyUrc03NVTI1V0EPEztvKhazh5g5ncXHASspO3uE01lmKpYBnTVcnfWAwEMXDFdns0VJVVyUnR1maq6SnXSWRjvbpRRiF490uqiYijUauuhzddFrqnBRERdlF3VRUhUXZReHm5qrZOouopwaMdITLwtSDAYjVZFUReoLV1yFhOb4evvZ0+iDmk4f0qiHxdWTWi2S2Az9GUYZ+CEsgII1KxdmYFLHwSPgqkXDdWeJG7hq5IBoi+Uqp5a3nhPLC24quqheqFidmavCXXVQG7gyoiOKEH7G5eOADCqVILxS8scrOMmrlg/vRAsp7SXKKxRGq56yStkqlNYSOsfVUFz/TBWXT1wNJesR9CNaQnTO3Y9UNei6fgKusbiyPKAosGpTvyQWpFCUGbkwT4dEN/XrMLSQZ6l1hXkFedZ119DZEAe4hln7rmEWtSg6LHnoJaExH1lXxAyLrrVo2ISlmfu3GkJHAqoLFeZZB3NQ0wvyYMgN3cRVGAP5wT4o2HMjVxbXOdN3w+oQZ9HNz5A5qvyyCteAm58hK9AhVnHBh0tPxXqDrICl1ifDQlNwDfwGWRX9XcU3XiG5xqn1BtYIVtm5n7rKOxPgG9AO3JBtl3dKu0tqaD0dUnHoFEp0/XqVqt3h51wXu4ahoHFS1dHR0TF8PlA42WoyK3K9Ryzq3yDiM3uORUPQAWCTpUCA4R3vnJAOl1rueV0VpXZfceocy4PlWr73v68pcywflGx55OVJc0I6GG8axoHB+AHKsWFo0GhVS8sP73z33j/RebCQqGqJfO+O64+W3/e9+uiHbIGVHYIfe++NHLcgpOEdf95w3x9GLbBykbD7qb9fsYUtgC4B7a73rrz32fvs6lqu+PTOPxwYscAy5K2R3+7dv/dP1zQvsI7Au1s2/3LnS/cczF0A3WTuboImVcETLMCxsWWBhsCFR0KLKT6b1m39bAYF8THVODFRk4pJbHV46wqzOxLGyVbODEN3BJrqN+YqWpPSnNXI6c12KnBlLQi286tGRJnaIKYhL+4P4sXb7VsONnNif+1YmO8qebC9Rq20vwc52eKmiVpcVwhxlx6u66yR012mVlW2yVSrOoZvqHrYu66qhS7gZJfJ4KpSRddVfTp8QQNE26roRvjZIf5bucDdMhDn5rIx8srHzZxVtYj/Pg5+OZeNAQsbEXXI66vO5SzmZ0Pc/VHawQ7y5SiREK5VBTfNjS8ybxa0QzltwzVTZ90FhpvkhxCSqApu2qo2s2YLai3bBGwwWVWHd14uGWMxzqru950LX0kVrbrfx9m6jSarouu4tqGKnAMEUBznB9MtOgtW1/km2cJFR7fmi/5AQ5WxDXmiDXniGvKs22h64hrSuCfakOmVAcpWCEJsyVF0rkClAcVqaTEswr0WnZUf8HFm86Cjg2yAdVfMWLvZEjdmUYJ9xzzX1ebocKhVLcY8993nzsJntqW2+Ittu9ydsAtGlHVgdebm42pQVrDv7jv+HlxnOrVdtmGdqeAPXyN+rNrQbmZzVjVxU1UH2bDV0sLW9vyQ6Z2gEFNvczrdGsjhrKrsqh3msBmk4t+fVp30VrCNeycoRsQkPIcr7Ty7lettZnbEHB4JGHw4H24rYHubqbcFRnCD5/Ac18Uj2syciJnLc/mwGcUXP/Hdr/39pFOxztERTrjRyodHIjyb6/yISFuEGzy3ledEInw4H9HGh8/wSO1um1H9VfjvzfYIH8GHz/jmj8fjr7YZZ3/16zfffPOfg+L6o8Hjr51ADgbbZvx55uxbzjv9g/ZIG/4zScTMbuUkUpjDGrkGXKnc0G4Snr3L/q63mTlCibdaHcPrTa/1pLfOCs6JDnd7dHh9+VzQkd9zcukYKa6N9hhvtr8Y3JfvfG/T7K8H7S+rXPRVbTr3Wlf7oEKLBLw6z5nx6eUTak/Lu7jSHqeKL0bMXOgoiAXduBX2HLafEjKzxis+7ruHs8aqiRsbAwrP4bnOLa0mDAoM6dr2tgjPmXHyKbc99MOPcna1RcAMw6hyCuPQWpDz2UDAeJO2AOVZEyCKg2VmTJ8HQ/CrYNuMXf8HUvnHYATvpm2czPDv+/HFI0asD7bN+PYE/2+/+tU7gBggHFSONUpB9W2YC0FxW043Bde1mxTqbovYHGhugxndKXIw2Ggyp5CZ7Rj44CKH1QeDPPtOU+fZETOH6zynlWdDt7JbxU2RCNdbTeKy6I1RxWtpad7QrnGiazxbl0UM0obLQcVpV9f1o9G1R9dFeGUiPGtR422m6xsV6mmG+Lz07tjagPqZM5PTuU9jaiJKpomIHfqnGoaA4F7hEEJHNHQRTRGZNaXTBXROrIM5nOTnUF24rXgrLDtEmJOYHlh6etRK7nH8Tg4uOES2aCigYAA5j1OuWe/lYMR2rUmXh2wHQsUQrXSKtdS1ow+ghrjH1Y7psWgY/VZPCKwVjZaDXlNBpZyFxH6OqztatAkR0nQ1QWJdaiNXl8ziqq7/S1VYE2v2NLJGmJEpDvPB7//3R8F1+DXy/SvoPBi5qM0zPbscG+mdQQivPS3vo2BbwAcP02Zm8ay2AOE+nsU9Mz5STn4t64k/BNukUr7dHmkztYiZzT3c2xq9mXtmkLb3T/pEe/vUtgj3gShqEbB3nhlvnHdw7vJLnwu2zQg2QhUvt0ew6vK3Hztmbc1TwbYZb96w9vdZTzwDlgvvOCP/4Lxnr3gs2Dbjlq2LHwrmPSHvWPLXBUWT7t8dbJsxveLErW9c/Yht6yIYy6gq3gTunFFn7e+gbiOGU/kWTtH/oOhmONMQeA0U5k3FOthB6+HPLA6zI6vPj5k646eq6PSEKwH7t5iWTtpUFdyw1VLDpmJtf4GEAqqYZrg6QfGBqaHcPXe1c8Xa/hoJmcoEhbRyZYLia4WipM3UomPlibLb9EYCEEvxtXJvBKZ891BorqEAotZmEq7NeFi1h3LaBjmU4HzMmH2mIsfnP5NWLcbxwXEgUNNJ//IfOG4hDNJD33m36H4xSDDCEV1/iTLWTJtgtTteGV1FN3J6rlpp7XuDWJFniRWhlhcjyoQ1Q1i0eBv8XbVtY0C1KCoY5Sq46KAI4D04c/+54KOpVXRjQHVpCYctLgzcFlt0zfJyVsaZ2CAs3gZ/D6vmbVOVIgj+TlUMvRW2PNJcn4lt7bGo6ri3CMZRRAruolMVHv1aLfYbisSeQDEnVbhjtGrbxqlKhbgoNxFmi4+54mO++IC9GXoyWWVbxbDYKlaEPVXEroMidh0UseuAH1x8FHHFmQ6mKcUxvyowogu2VRh64qL5Yn4ZYu9mtP4p7S6L1FQs8kW/znY2aMQDuFnExUUX+0g83+YKFs23WXS+jCYIFjHBIiZYxEQLTLCIiapZDItYUhZZzbBPsEllcFQXuo4d5Qx3e7hyMuEuUztNmS+/F1Zy5UHjiPuE6BFOdxp5t95dzlbhQwrpraLrpiqbIHim7jTybrkbFt915Ww5PBZXwuWsWGyhg/iXw3QhZB/8fyK51IJ5F8YoQSsznqUgJhGKW/OwMpXMt5C+qg7+Lq+zgqFytrTr4TQVMaCK9TGxhhm6qYltfLyoxUiNFiM1GkqNKDmWa4LpmlAHTYynJsZTE+OpCT3QxLBqQg/wo1p8LBV1ruKa8Rw+YxgfUXMesRu9Av4afrkiB5MI2/EaMkxzpJUYz2M7i2NZqT/CRHCsK8fHlkLh+AhBFaNkWDQEQi82vmWgZSbu/UXeItb+t4jVSi0O9dgbVCreZ2K2y/I1GKDn+COMMlPPlRBsWolNNkGo+2zJh2kkhCvbUKs4C4HIjLbVRTXFztZMNdpwG5W7gjLfRXbXZLD9JVrGmBC0zLBl8G1AyWfj3pyCLTNIf4CW2Ta4sopTbJlLN0bvYLhjDbUv5WQ8SDG94htb60xkyarQtk1bYd+yiBWPEV5oEQuPgR1D+FKHG9oW3r08vDwkbio7G7dkKafGXK0gzxrdlWQntaOYfULBJySYC4R8gbltn2oVit1SSBRSoQKOmT2qSCrBYCvML6pTiQZjrLkreUW1DFmJVs5GYiUaVKKJSrQQV0VMfTSGish4ZTPlwpuDH5sop41Tlc3ofpBz4NJNlNNz60WKCRQ4N1q2qvlKTjdMVW7C/US4dhetgvvvovpFlDbCtQmKD418ESMPOMEn+eXr0S9YsHWLkXerY+kixhFtGPcHUrQg3RKZpvgOR0lWCSUpQiUpEkoyNkFJ9r1HrJeTKUlRzyhJsa0kY+OUBBp+JVFJinpMSSpsJTkJ+eCzlLWcniXy8A5+QKz1WdZuItysIty7VcKwEaD/rptB+5kxQWaCMXnMx8Dlx7FrTZZvUjvKTGWUmdpRZupEmakdZaZOlJlGo8zUFWWmTpSZiz1dsQBz0j4UwxDabk2EsLkTMSUOK2gsK55W41hBw6FJlOjFYmMc7zkjWvwfw6xJrtLyj8/I1a+D/CqLFuqSf5hmJXiYS0BM7dwSXJWhEOVY3ujuhZBOHFvb3ZFpA0Iwo1MNw2QDubDGkq5mXU3GNIjpg7kUBMOaZOjSEYy2qjitKpiVIHPyoq0qYIriPIIAS6dlxfLaLReLxTLharRl1WlZFc+rxrTMwFiOFDtkXBUlh+vxQmltzsHxeX6YlQW//4yJUjhBofaPtpSQxdZwGpotWWzA/8/IFxqKZM8aE7Kk2Bn5oQBLw/BQYXhkUiDsIClh41Wc8AlsdmA6LJJsxW/5gFj7FGuYqEDYG4VTIwBMxfQ3LO72eUVFPpPKzXHDFBKg2iquV8knHQ0puBB9WWPRkFEgsqBC5Ww0Lm2UM2SinBKymo0L3AsZBsKezExcl8RMgNNKINtSNir4ivvwVDQKEysLl7PRBXmWL03bDVWNlEEMN7O+Qy2PZJat4lXEOA5qBtmg+t8ZU5tpk6Nz8UKIKQiwRPedrlaK1GYykQjDJSRDRoqYu6+5ahp9u1u1cuP6ZhwT8Mi+if1JrF+qGvYDh7XaVC0irILmKqLFdEFxBb5AOHJMJ3nY6cLfidMF0QhYLNU1gndSayIOIKZfoYMRUGzuebhyDwotdOyejY0BD3pFAcgM023TyT2JymZidh8aOH0YowynT/CfxFxEjUWw4cqcMpilQ+1y0gBSPY21A7Pz6XKsCsdU2tdwSJitfbLeL3Eqs9Qa1EqwCts/JtZRMqjA5EihCSCOlRUVYaq5Y3X0O8A8YXyiKnjVlSat8m6aKxRzq7ECU3UwstxCr9hqrOC0aphNrvJuckp4N0UL5DkFhkULDHMVGOsUyIsWyHMVKHAKjI0WGOsqcIJToCBaoMBVYLJT4IRogRNcBSqcApOjBSY7BQgW2Wqs0O3/Bsui9ve9t6gd83lb1P4h6aL2SqU3F2Rr+n5BJiLpk+jhrsmgHliWQZpj7y/LujTOzYNGZ/f3ns6anzedPZBUZzf2qs5eS/tBaRkoLW7RHZ7SMqG0QmJ6W2kLulLa79NBo7V/6j2tPeHzprVvJNXa9QqjTUpSvVWieqtKvVWieqtKvVVi9VaJ09tW1Fuji4FRhd6qQm/VqKKRWEVzFFacpIQ7XYqmWAoo2niFVNHGAHPXo6ZQ2M7qweUp5Lb3t8L+hOrjCScPgFJZSp0dGd0XbLvlbouFTWJBrNJ3Rr5F6/QJhMtVqbX/E7G0+4Vi+cTSm1OjrJxxuWmofwFycGVpeQ0O21k+sdJnlm+2Exq6wF7QiSegxhT9dwPeigATlWQLetPWL0u1JsZbAji6YNxH5WLbrZYxShah8VrWtVnCtt1mqMyJn8mLMQqvxCi8IhReEWbI3l0VZkgRZkgRZkgRZkgRZkgRZkgRZkgRZkgRZkgRZkgBM6QBPzUM4NmP1I1exZshBcxQnN3mxHgrmRlKjAs8D+k9EBUsyLPGJoxe8nleHqczfkE5PQPDyS2f4nYuNY4NEBFbGQnXODGG2xdgmd7SIU/ntXQAhYp4GsGqorfCIStiDLcOdhBrsogCQNo4mA1vORvNKrl3IiHgAxll3FvE+CxxTpd7QVsgQwTKFjEVE5XcQkFdQoH55vdJbwUrrITKxoJjMhaix/taKGr176RWO0d7UVmhrYvw4DkNoDPDAx4Fa+Dcg0fe8Lw6MwpNxbiAYxaCE8KDQ9x1AQ+quMq9IPd4p/EA5prb54P1mHgqwXgqs+OpQByLEpA4qFsV5ukswsZZIAsPF6SKsimuKJuSEGWzpSJVlO2nakIEkDMnAggDlDVXJLTLqQBsgRoNtUGgLRqKc9NND7DHqA54eVZVB92wNaDxrCrfpkAWV/B+z1nYf5+41QO3+hL67xP993EPhOhEppe7/+8Tp/9YgwdCdF5XiO4+O0TnBZoa4trJhNghOjHEOscDVqo7Lpc4UK8yRptY73kFO9EryEnTK5C5elE3Xk3uxhfkSXnkijEOXQAxVklvsl0A102cGdPsUHh/zvePUf00CH4fuxZD6Zj6MbtBDDOEIF8mMgYpts1F0p7V8umGy+ot36WcWB3rP/HWW77LGvTVlDbF1OSLqel2GlvTeIWYrMq3qeqzGq46ePvuDrIBMrOdH1W+jVeYrMrYVNXRsaHlYEcQyfJrlbHxiip+jT6OyMbOija0l1gl7oYmEqJ/F3YIMYAK8VZTwnJYyiwwcldSOI38LBP9g/PfEkgEDu/gPhkCiTD8aiY7EqsXaCYTp2dxP6XBDRThFLUP1VIE6SB6ROxGzET8BuwXsft1GgSBN2K//sgsDYVHsRC6gxiKdmhgJ/KEL+PEOeFLeFxRIruOQCX6NFKgWOQMOLBVoKiVBjai64ZvTMyFxEPa+mR094rYXDc0QhGrjv252MQhgZ/6a26gh67/gesI2CDDphE64ogjjmAjR45QRhw5bLhqaB7vyBE++G6MHJElP7Plpz5ypPiWMyJXH65LwAexnZYDaAAyp045XYw9MSGAwLDH4jAwnicdIe8V0XtOQjgxynN4JPa2KCTEcNc/uT/mZkdO7E8j9ufIKLOcXrvpPjcd1NyoEuXGxpYLd1HP+fF0knhDzAWjSlq+1PfpHsJJoa6vJXjoHfAm6iy6tpBZL2RZ+7IAVuQV+8u+rELN+jDLOoi/Pra/HMwq9FpX6FaLDr822V9a9MKs+PSNEyqNI6IpwIW5+mOMeuycjLjt7ZgsjOjxPU5my+1M+wogEoDrdFAXHkGcUyWwUd7TRZY1ngacGXccEPepwib7UgN6GPIUoCq32binztROlx4xq+PKCpMtD3i5ah3EzW1jGPhJIfilcW+dkasJkmbk4toSTg96RL40TLQFedhTHxSJeQxjH416mTAFoHsqE86HO+nWNHGmnteNPEhqjMApEba+LFaIuR7W5twiRkaoBBsUrrverkJibaNcuMe53nGLdcXaTq2cmFXMUvGxXHysEh9h4aZfJj5aqPjcJD83w2czzJeidERevwtcYzV5ToAiUkbegY1LXYIOuZcmRCxNErJS4WI0KxXqKhYfZdHlU7N7+WRFfOVsLn6ij+u0gmtbcW+1+Fgc34NuNm2PgSo2YeHopbV7n/BYTrXTme1MZxAYY4Qpd/AjzyO6S+R5WCgz40jnEkgdYDHAT2MkVrXb9iDEhrYGMBy7nxfN7JW0AmJq0fSqQsSxmCbca/SbjwLxQMcyUSoXCqn0pZn14CQeqtH8Bsj+O8k6IpreIHbFR0t3Vo9QDFx1MzFAjdv5hlZ+APIrizp73+j0jjYpV8D3Rc9XRdAVpK4ySWibSTc9xuH8Hh5b3raxsYquw8O/Mp+g1cMU0cORSXJ44kJemHcMs5XxEhVrHVX0NzYIBv19gwiIFhm8wlkJlpSmB2JYIt7l49rMXIV7oEQOHO+QKxYIz4BdmkjIPZiwPJHMt73WCvgzt3Gq+FIJwfrxylxcDWNPYn1o6Mm7xNKjPrQBy03JN8ZVh2+aQAmDJSJwTuUeN++gN4J3TVxpxFxq0JL5uuSbzTOWgmc8JZ9OscYcOptsJlWRc1R0mkSq7GmwpMf1+0hUU5xLzwiIdG8IgxHx7TOHvwhTy+WPuVNFWuP5DqOL12HMzL6ECebyRyWmmduUnU42Yxv8nr1zCySHd0quECG5IjmumK6O3XeyiZKNZofMAIGhuwuXNL5zwC68LcgtVAw2No2zxUg5PXFioMtpRd4RRTdS4R4nZFbZi68PVCsfLjzOFKWJNqaVmxl7cgtXVHOdY1uO0R0u1+eLk0R9/2l77XlcSItxulKZuvjHzLYLdvEXKWqmJu7wQD887jv+xaxj3At0jXuML4lysGgWNy7lHlhmKWJVjRriDW0LULgMm1WOZmjcG4J46KbGJs4abdicneLRd24JqNFTWPuYQhtZUx/x8SqlW3zcpHSXj1cr6fNRjeMjeG0qVzY9xpVYJu7ktNVknLXBfaN3tkVsjtoMvT1AHUdLvwoAFOXkEmO4JcoWp8YoJ7oQO6eg7KjWkXYUQ07lsMAH9zAnLhocH+XQ4NCEivlmkIslLZLKNbmsYWdI5qnOeUDNKebDs3+Yux2Fz5FRe8ehBGMdobFpkHJaTZzKH4UFcRpbOHEh2ZR7rq93kbkugULuacRsabmGQQa6a3knuuNK0HS7QoN4oCfE2XRMXcfdm/1MIF507yHIROITPub+PwuAN2OE7abnwDV3HBkMYsu7Eg6u5V0IFENHDziH0DgzzhZOiB1QY2kE1EiKkBqnxhyAsCliZXCGFeEURaq3KG8CBhqt4576UECqCyQKqs0WCUiBCddpXNNlsjc4MDHejuiWqYa2iVxQzjY9xhmolOJ4O1MVQzqB+uL0PD63LzYWPVfO3Kns0x2Pz4bD5GJT4TB8vrFx+gntPJ3S5ys+LJ/vas3t83VjyzPq//3O7f+NjfNroO+30wT/ryiZY+NSF3u+7cohXAoyv8p2COfCn6WNU8WX+cIhXGo7hGPjXAjo2h00uUNYfBgO4XzhEK7CkOzSuSDBGp7ywC7GuT/VO7fU6uiUnSOcsrDjlIWla+VzfiyVTlnYedjZtlMWlk4bd37Ml05ZOEWz0ikLy0Ms0gWzOYlnC42xqTm3k8Y7X9x2voD8S5fzFY53vo52nC8oukc6X28xRWmmTbiMH5mmusgjisKxprfeF9CiO7fgNT5gHAFZyRDVaOPaTu5pazXpLaYHTl/boR0gOhgxrUvy7xNLVAGyi8CWIughpjHFOjgMAF8PDounY1BEFZKEwXmuGsOxJr0gLwCgiiMcMqx1/4J7eCp8MYbbFJiJVM7EjeJgUbIu6NgFPZ7ujsvgnObUpNsjwPTzunMSFaGUMRBjTxsYiIEM4mSBmD9ksSwRiLmVHlLqU9KDuIe6VQwfq7oM48CTYhgHgg4wA+/+X5wV4QJ8N4bLUw04Rhh/9gJ7vW6D9YDHGiVtnCByanwZHBgwUNx4mZo+tGMW+OgvUzML0DLzrGzjFTR/IwvyrGEWA4pH5DJ4jf+HTif3Gl8xs2H/PHuCUuFo8SJwDwIqAAeMV8hOzrYY8+x94DNl2G4up9ZBPbo/PINnxVYC94Dp08vZbE65q+h0WUVlXBVlXIMGufFV+8aK2BtPlDcWx91Y6NI4FyZHTG9atxjztJRPlbpLqZ8q7c7ZT6UHsgvyeDYkKFCeHS0BCrsbFJbD4ay/uDbdVS6OsQghsd1WZ9RpOZvHiXFmIAetUA4+EpjT+fib8BzjLHFNK2fni2uwkSeeHW6vhvpATDzlbDEsMIT7b3wVpHCpfaHI+CpI2HLxGxJMjK+Cb7mqIA+PZeyHzn+PCiNzE4XfYJ5ss3MdrCQ2//UzM7qZchW+RWlXULEQ2oRTXfQ6aPk+uKUFbtnnviUseHMZHGeKsgrksuV9IgSz5X0XE2eAnAsh9MYK4W4oD0O+212+rCCP+8Tw+uKG930ix9ddvlDYriKREOFErgvyrO0HcVAJfHFR4HwIFDWlo3wrFfZtK7hLatJ1VvTAiguC5T7wXRPyaTzCuOLAjYY/hpCX2bjRHust4g1eUbVXHKq2cdPlspQT40sgCyr3jlfgcJ0HnBgvbo3C0lE4MQEvrLTAc/ai646b9sVjuBeAX4TrjpfCdQBxBY67R+6F49487oV7cAthrgZQJlwx5uhQ/WbK2TwkenDTmclNZwabzh7cdGa46cxEgXOjZWHTmdmbzlC5ByQbN525Ohcm0PkNM0WuxjqBqCpQKph4RI9rUYKdXDUonkw8De6BSnPhE1stOIdqEEFQrSiIROIXi3CP8QJO9MKNT5K58p8spjThdtXoNMMrYh7WJAx34jItO9kyzfTCQGTbC7VsCF9EF2pe8JY9PBuWaiidtj8NDjRscyOPY4IfHulKAy+9Yjlr7Tso5tjLNXG+ESZXuNM4G/bZveOVIvhd9GW1GVoshg3XYpHKhBdW4blkmduk4H5sGfcJV8oDv6KZm3ZoVXUtOHxc4z5cboDLcg6mLPlARuA8YSOcffZBxMKHsRlQMm90qL3wYxOFv5upKR8YYjpcmZeP0gSkmyTpJkk6N99kSRM0pEQhiP5SpzLqqLhHpBesAi5ugpQeiorgEZvQoAiaOLXNPUIRqFCEQFYsK3KAFVSwwohjRRayIiDPhUtpyIou2rOc0+OmzxYLn92uEAvsog+EgkVjYdh54u48cTpP7M4Td+ftXB0UOdRir63FmAkGWuyNarE9FjFa7I3RYq/Nc1k2Rouh8ujQWgTT1Dw8a7ZMlKLu1N1chftkan0M9zwxgkTjFAowohzuCZQvni3P2WdbJKDpgsfZkodaPA99Ng99MTz0JfLQNwB4qONIivQ9mXRUKTSh0lYEZ0E6WxBm28ozVZkNtk1GAOOiBldkZ4xfTxk/nzjBNYlm7B/z8awoNzIm8FBMoCdRnDJWMGMFB74VxCNxRSxjBdEKOtzIWMFDs4IJ4pSxgr1jBddnrGAPWkH7vGLGCPIshxkZG3hoNjBemDImsHdM4MXdT3UwkpxG+yFNxHziriCkfi1NryH3sbdkDX0rHvgqCXTdK0mg6zg7hdrd0Zf3zEPfScWhxZiHhlf01bufvIc4fGNXHH5Qpb7mbh9Phx18zs4UxwWMYxELUm7sG8eaciNk34eYjb3vQ8jGppiN7boEmyHRS06C9r4PIUEbuv4hk0e2FfEqN+N8UxFok2AetZniTc8WhWOceDhbABZeoMPMpSAZjn7CacosSwHNy7KUWXjoWjEuBJx4znjWWmt4fdjMBkjIZYi+ng0v+RMmJhsmYa6YHuMiHJ8GM3uZqXDfmZCV8A/B4NvsXkIqmdc4PqCCYnuxW5BXdgHopBczl6CjPNu4QExxFg2FuIq/sNuAum5cKN7bZVxowmEndbXolpery9A82e+wzeYUkta/JA67wlfx3lYV9T1kXGTq8mgxDQl6iOvQFXHwMeYgq13MFzKpcX5A4VlwADZL7iNgdjuDV2QBIkBouH3NatYfg/0ALR3ZiXWDbP9Hi/o/XuH/YGiojmvR2c5rT3Fe266KKU6mQEJeozuLNCC9F8jTB6Kpmo7/ozq+D0nl+xC370Pcvg+J931ICt/HY2cmiulK7KGBLGmwGwn7bR5jnD07wX6d29WJGmvxDt6oq2MfvyRRrwRdHjThwtUh0sWh0uVBI36Iro5muzoaznIe6epoUVfHI10dLdbV8cHmaExmOXVSXrnPGBdgMVOyrz4EY29q0A1fdGb22MMOe2fSs/Hano1HDLrm8mwQasb2bLzwQ3o2mugtXop6NpozJztHcvGlWnPBzmicwZwszr4q7rOvipyTlejZVwXnZCUpk5Xo2Vf3WDqejW92vKjkJBEVltyRybK55vJnXMqSZXMty+aaN55rXptrYvM2S3LNG+ValuSadwBwLaknw4Qno9gOi+PJMOHJKLaLM1tarSSezHv0UGCRuwvxZJHUIE+AfpwvwZ5gGLHXs/MBtMNUXRAuiRnATkojk7kHLghOyABWxMYa5GbKlO7HFaY1s6buw0DLzCYiDqhZzQFmNQdUBwrVzmSPUHGw35O0m2IjGvJJojgzMu8SDv7L1V8jiia8erEZ3gJCTqvPB+Sp2Ne1QMfOluw1KWgFq+eI38CcacWkNq40cXClqXTwAVpazCIA8Wz6XBn0DMZPCi+MtBLaZvo2PcZ9MItQBKOGmUSKtYr9YO6eqNgTKgZO9ESxVVMRzYJqUjmPQQOyB5vofOHV2Nrgi2qDV5wEFEfzf+NlTCSNTO9ejq0IQagiJ04VOXGqyIlTRU4cpuFWONLoTciqhrft0DrurQ/BxCDCDNG0ao/9eB778SBHONm0+34PTrvaGTJfmLplMBfEyC1yqjxeELNlio4JV9a5JmKY1QJajgu4gLN1wH8tdYM5rgZzkjfotuXi1aLo63jQfjpmPIaZNMpM6uSoK8ZCXC2C9/xPPDkJWfkyMakCrrlzpCCHafNHModp80fuHCauRBNIixB1xaGNhUypj+z0NPddI9FDXRjN3xwdmwMFvvzmj+VL3jd/bJ8CuM4js3sVt+1URIp51HZ6pO1UHdtZRThbF2C2ZKEP6zKgarLpSO316SgqIlJGNlNj4Vy1qQoys0XFxkIdzq4SOGVsFIHnPD35HPRcRpsPR5slxnzfKbTmQJlmdDqj0xmd7g2dZuGYvaw+0Gkb6TSj0xmdTq7T+zI6fVg6LV6L04cqrYBKC0CvjEZnNDpRo+92NLqipzXaVmU1Icwtw3hqPSBqC1V2he5UW5VVW5W9faDKnli9im6zqnb0NjZuHa+5MaHrpJorWpD1C5MwE97KYkMPxgc7pZp6RIjYVsmYnVsZGw54xc6tyr3ubdt4XS1262pZvK4W2bp6YryucreuFsbq6mhbV8fG66oRr6sjY3WV2Lqak0pX8eCw6tJVhDuIPSWvJeiqfVReGxC6mhC0TUdXK5Lr6o9o9xCVrBxrqqHL19TZr9ASGLY2qpq4yJ23PVP7LTY2wClQ4J1cOHbjZVw1tqB97P309M/AWi0+41XnVC1AKCxzn3jdTLu590vhNVnUBWzDBFgiwzdhJb74Vaghvh5LPB1owvikb8sSO9+/lQAY6b5fyOkFAQBHgfhaZ8n3hEdpggovnVNDRp3zbi4bK4SYDFA78S1MLA7/81vUeQcRvokJjv/Z4J80Cv4pWoG6LDUklA5fYPevHnkgX+oH8nX9QLEwpD9NeKA4DFIaj0FKYzBIaTwGqYBowUf3uR/93u49Oh7XVhI5ABClyZ/d9eDMeXAFqXOiz9tCJRoqUuB5AalFdpi6O9xtJL7R/YvEd1QGiS/P2v8fTPTY/58oEp+45CR67P9PTyLxTegEiW/rQAWhix5cyODQdcIpDTmFfMpA0WWg6A4Lim5VBoquR6DoVvUtFN0N/QhF9/vOoOggibQLNDoJr+wJYQr+JErgxXWHC0n3ZF9D0kW3vA4HlQ6rISHOTqUDDZhudY8C04UHEjDddYMSkc3tHWVA2YYOKFsG0KsXAL3WZgC9BjugV30ngF4NGUCvDKAXysvKNAC9/pAM0GtVXwJ6rbFhr8JDDdCrb56sZwC9/pgB9DJW9yegVzgD6DUwzzCvsU/fhjOAXod6grlPeJiBshkExi8loFc4A+iVMYFDG9ArYwUzVrALQK9wBtArYwWHNqDX4LaC6zNWsNcBvcIZQK+MDRzKgF6D2wQOXTCf1X0K5hPOgPkMEDCfNTYsTTgD5pM+mE+fcK3XwHzeH7JgPopInMKgkgvP58mBhuejYU9F7CYD6fO5h/RZ3c+QPuHBA+nT1O8Hi5sG6sHiNfZhxXCfHyxuijus2OQ6rDjx8wb/sbr/IX3CgwrSJ6PTGZ3O6HRXkD7hQQXpk9HpoaTT+zI63RuQPuHBBOmT0eihpNFDC9JndV9D+oQHNqRPU79D+jQNVEifPtLVZJA+XepqCkifbkN78P6F9ghkoD3yrJZPENqj5ZMotIe45EB7tHzSk9AeJw1KaA8neScD7dEFtIdcFmagPXoT2uOJoQ/tsZH2BbbHs0Mf2yMlI4cguMf+TsE9WFrgHswB9yhiAi5u0IF7OIGywwP3YALc4wvMAfd4fWCAe1xNexTd4xqagfc4bHgPl4eUgfcYOvAeBzLwHj0P73EdzeB7DHZ8j6toJwAfkCGcQfgYJAgf9/QqwseVNA2IjwPJID420r7E+LiW2lAY19ChhvLRV8/WMzgfr3eO8/G5ON50Ne1PoI9raAbpY2AebgJNFudyQJMzWB+Hdripj7jYa8ebrsmYwD6A+/h8WsFBgvcxkA3hoEL8yNjCjC3sGvTj82oLBwXqx8C2hYMI92Ow28KrMraw96E/Pq+mcDBgfwxsSzh40D8GuyF8asjifwjr12cAIC5jl0EA6V8EENBJAWYBOpnBAEkXA6SP+JZBATkEFBDMsMLl1UBHAbFPe2ZQQLqDAvLCUDyPeDhTcI/AgLgm5QGPA/I92u/HEb9HB+p5RDE1qb0/NSU7kfg9GnfM6XvUdc6puJMzib/LaHXvwIH0mmL3Dh5IRrczup3R7TRhQXpRt3sDFySj20NPt1/J6HavwIP0omr3Aj5IRrOHnmb/z5BCCemBGHc3YUJShbkHCk5InM72B1CIW2cHFlJIn+lsMqyQNHS2p9BCivoXLWR8Bi0kz4oItJCICy0kEosWEulRtJDJnaCF3DFg0ULsje4MWEgXYCHCocxghWSwQg4LK+TWDFZIz2CF3Po5wgr5U6dYIUpaWCGKgxWC1v7wsUL2SqyQnDTP2ovHORysEHuFHQcVonYGFaImQIUoAipE9ClnAEGF3N6zUCGRAQUVcu3ghAqJukcZpJAMUkgGKaQTpJC2DFLIoEcK+VFnSCG3ZZBCMkghQmJuSQcp5I1kSCG39ilSSKuDphEZckghffVsPYMU8mYGKcS4vV+RQiIZpJABehSq1TnCE8kghRzyQag+4mLmdPxgMIEpkUIiGaSQjCEc8kghGVuYsYVdI4VEMkghGVs45JFCBrstvCpjC3sfKSSSQQrJWMIhjhQy2A3h0EUKub1vkUIiGaSQgYIU0uogXkQySCHdQArpI771GlLIX4cwUggmWIFP4QIK2TsQgULkGbEMTsjnHifk9v7GCYkMIpyQu/v/VOLdA/ZUYqtzwinS96cS744/4XS3+4RT6ecNS+D2AYATEhlcOCEZ3c7odka308QJiQwunJCMbg893X4lo9u9ghMSGVQ4IRnNHnqaPbRwQm7vc5yQyADHCbm7/3FC7h6wOCF9prPJcELS0NkUOCG/YJQmP3LhRDULrZMMHSAqMMR5MpGRTtUOeOJHjvgwxMdI8TFafIwFjIqOjg4vjD3j9AGZZ19cecfdWE9BLmdFTH1gCVY+kRBxKAEa0ZFiKWE82JwURIRan3R0dCgAgLE5x2r5B7HKrAny3CK1iKHDSR9iZ/8zECYfp9gCtQ8MQys+Ew8dMU4NE1o3yu3sf5aY/d9tfJWS/sVXKc3gq+RZuwW+ym4XvsruWHyV3T2KrzK1E3yVvzmni42u8FUOD1glepAYsyoUsdXoQ5dNNcZ1F0UlFhwhDkVF7FO4UFScfTRTdY4Ja2JjOm0UFaNzFJVuwqekYgcyIyVWipHBSjEyWCldY6Xcn8FK6RmslPv7GCvldOEGqV1wk0qXw3UOFSAAAuCFqOIY608Z9aYzMB4xMB6JmWIpswJglO2540LTs8yELVyj0MwyLuCEZ3GPcQHMuVyDKelLaqXIqBI/TS8cmQiFODGONz3GBXDcF7fQQ8ZFePSaFLGRdq6NZH7LB8S6SbWyZY90kVChg9M/0tShqO4uerPqjKwujuJ7uM6zjWOM4zTsNZVd8dgNQ2oadgr8E+OBmBWnvTu7nkY90E74lQyzhqG/lhyzhqPDSsQOd5lRAYVhgSUc9higGP2W9LrgICukhMyxAWEA9Ab9L06NcajNTp9To7/IZYwc/2l25wYI1MuDPQv1smNAQb38TXU7Y2lHLg4P4yXWE0mSBJLgqXUP0CXWNMcBusR4asUxnpoHBkEAughfTY311DwZQJeuAV2MDKBLPwC6/DID6DLoAV1+1hmgy88zgC4ZQBchMf+TDqDLW8kAXe7vU0CXnQ7oyY4hB+jSV8/WM4Aub2cAXYwH+xXQZUcG0GWAnljb6Zy02pEBdDnk82p9xMUMiMFgMIEpAV12ZABdMoZwyAO6ZGxhxhZ2DeiyIwPokrGFQx7QZbDbwqsytrD3AV12ZABdMpZwiAO6DHZDOHQBXR7sW0CXHRlAl4EC6LLTASbZkQF06QagSx/xrdcAXX4j34aVVuJVX+C4dJYk5cqJkUlSzBiHCXw+kcB3j8JUAdeSXiJZlygtsiuJCY6x6TkEZ7NxsOl4Dm5meRtRNQ8RkgW8YDRPLCkeSuKEwAQiiteVFqmAnwZysAlzAMGcmd5Nj3EvTAmifLcxWZjdB5YEk4U5PUjAZPFGhdojMVl8QxaT5cH+xmTZMYgwWR7t/xOgjw7YE6A7ndNkO/r+BOij8afJHnWfJjvl84bb8OAAwGTZMbgwWTK6ndHtjG6nicmyY3BhsmR0e+jp9isZ3e4VTJYdgwqTJaPZQ0+zhxYmy4N9jsmyY4Bjsjza/5gsjw5YTJY+09lkmCxp6GwKTJafaow1pXUcWZEwH/DcPgkvgicqjC8IXOYiRiwaEoe1Omg9+IEdZAPAXFe10A0oiiLS2cXd1L6fwv1V3o1XQCDQrqMprTpiahi2kbPDrSOvB+oY2wN1FPRAHSf0QB2TD6eOqgq4W+NMT/X/ANXliYsqwmkV3bAO/m66Ur9SY75o6D05ipDohwAREv2YjidzsR9qSIAL3dBUb2248ztv0FlqpZXFmXWQ1lvqWmtYvSCazLoCyZzJcg35VtZpMGOsp1bkP8S6WR5Zth88tkEtpsGkZcZ0XQSPx3Ze5lTIbxFlfKnL6F2XGRNTRLMOXi6e88fUwWTIhgP7cHhvXj5XjdlwsE3lPtacFJrIHg6ZnoN1hwJeOEWJ38/Aw7lP0a1iMxIMoacuoGhcMRnuXcQCG+QqLsdBAhlwH05/WfAYWe59k9/Lc+5c5VkChF/jWY5Hy7ga4p5t0wngGSAwgDzpIwB0cij8NhbZGz6+xPM7mzJiOGDEcOWgFUMRD+WebafSTiWxuRNJvCYjiQNGEq+kg1cUmRTFL7BORfH7NCOLg0IWbxnEsqhIWRRgUill8SedyeJBlXkyshgrZ740ZDGrR2TRB9lRnPIslEVxfF7lnm7JIoQ6tDhZ9Nqy6I2XRV8KWYRApoiQuGBW3EIYDZkw7t0WxUJKJnGPORLnSZS4bTLHqYuFtA0kSmZzYo2sK2KGRdeabBun25qqWlpaWui5DQJedHeO9TRzkCEJp/kCZQmWRdbBnOE6pxZIpX02XSCrUc6WWzRsUQcEFEGoaJhTY5hdVNHvolEUstjRsHHHLNXKkoCmXFxLhYpKYlBR979JrFeJNd0WeSvb0G24BmycyrQqCE0Boo+ExxK0RL7uo+nhpRG7M7uJNVw2KXKv5Id8X5YhPkaLDy4+ijhxIYUWx/yq6JlanGHSd6UnKdGR2E8sw4WL63yots7YgLiiS0x0iYkuMRFCZQKohwmgHiaAepgA6kGs3fmcGc8hNMr5sZC1CFA72gG11b9NSbpiTqTEWrocEJ3LYdLE3oXrq2gM0d3u4+w+rvzEmG0mFhCQmerJxKdHOXo57T6mnipF241U+RKRUWAag1QpiC/bMK020ubseQES7cOybg0qYoQyuyexr5GDxm6hVsCGeSrj7Ex3S19O72EdSfFZRzjSI3SP2eg5ckjP6B77LIC+s00Dj9Ft/aFDGIqxcUMB4FVX0/ih4GIogHiNnFJFhB4Bu6rnQTbgRDJawoKNV6qryDmIAOZgEE0D7bXoyWR0jhNgstBsiq+0+4NYZA/i2LhBhG4+28kg/lG+47ATA5xjeR1EaVOJx56RybJCw3IsJovq3LkfLQSVaJwJyNVHWtMcE02EfKgwe6B8oG2W0IXioipG2mfPgAp3Q10nsdvfdT1gp5tB2F2LSE8DWj0jPwB7JfiawGZ8tR8wBX6fka8hXBzlbHa+zpW6KMGkxqtUSnkRIIWhagEAYG5U0H+SzrSXl+6092lHRwdNNe3RsDXq8Ga+Q5kn8gf3POE/pHliZbrzRFrDf3S6ww9A8yTV8LOwdUzfD3/BwBn+7xzC8B97SMN/JU13/O9OZ/yP68b4B1MNvxK2ju/74Z8wuId/3CEN/y1pD/+hsHTK4Gbp5ENi6f+kzdLbaaqXeni4BNOD9Ad46QCrLNAttW4Yo4zoRMcsg5TKZfffZ/cftAqnfsyiMF6gbt3qBGqtMk13lNseHWSGuEG2v5Cmtx2tgFN4zwXDCvQvMiqwV7vRg/GKsRP8Snvgg4fQhftgjXpYfajsiT5UHl4fZvdEH2bbfZhxSH24icZ04tAq2dwTldwVW8lVlNHGFPOZvdBLwLgUZow18uhryaNhCgnan0swxmecaZyli5fhuCAQk0xVlxxyP9y9gAbTae391JM4tyfxuMaSYOnTBCxP6jp+mPRg4G1e64TYYUmrJTvMp4YcsxKLKulYU+tnNPRg4gOHaE8wl9P7jPzYFhObuocx1sSSt6aJ1hJhUzU5s4jWcOJgCLCKZ5/vizkSS+wjsUTmSoojsSR6JNYjj8SS2COxBL5hwpUGwBvGXI1jxpUxR4fq7XQrDX7Ep1tpMelWmp1uJcvGpFtB5ZqTbtUVu1qpO33qkNhFHHYR5JWRD/CqClfnIbyqAnCkCr6KAeFVIQsuX17FJLCuuvieoijNrMkxNnHvjxKdVBI6qch1uch/k91UYrZ8iAsvXAQZqBNp+XEU91m+A6Mt4LVoIZwU91q7fUWMjMghrbc4oNN33BfwMEigFKESkUBpv/1ABOiTHYwFTogkaRV6qYj0DgUPEHKtEQBbFthHXxU4EwuHX0P4Jo9k500VO19UcZ83hTOujomsUZvE0K1yJwFrINyhbaa26TGubdS4lkCUZ5hN4pSqAtQBJk/I6gFNvqUiR9HxHLMAoZUXq2xnyY1FuzNxtFelMhWpB9qV1xc1FXdzZpwbIPEGKrHBk9NwSZ13TRhfc0fAGlO+Ds4dpIT4Zbx1c+3f2QoEmapEvFUNGpoftbC+pGrRm41/vT8bX9CfjZ/Xn43X9Gfji/uz8dr+bHxJfzZ+cX82vrSrxm/R4MUbTYfju3nkFk5cIXtH0giZAsikiEFSv9f6LqQgGMvhEAT+xe/cAyj2+GW8Mtq4RHwx4EsVhb9wN8w/+0iKdtLY+ZQnNUS0g4hoBxHRDhsRfjM1s12494RnC9x74QsyiQ1PotjwTGLDkxhseNzzh3iCgNCAOQfBIkwoBisI0ye3/WXuSS6DjAThJ2CiiU+860bihmdDrjxFEHusrgkeXNbgg7cf+Gbmgq/pw1clQFoLCgTUQLEGrQrz7eW0DdvyoQAVKfrMopC+4LUIZ3XbjBMAkyrbOMFOL9hHYManiYn5YkwAoUaVqSheiMTU4SiKyAcUUeUyBYsbr0VR57ueuXcw9wZUusKZzF9gcerF4tQn6euztnjtbBEAZUn0TZgMBeH735h07qAQLqY4FedfogTKlZB4ZWyU/fHRIfEO0zjhjINnySEJLnUC63o76DUyRdDrj+kGvXo9MlBvNPRtZKA+ndY+GKSRAbp2IAQHThw6wYE1dnAgPMSCAyd2GRw4sTvBgQ5FgXd7pggOdKOTmGnZvfeDHl6wQLFDBaoNh0rccKjJQgVJ8FHVKMo5Z40AcOVEC+SxUq4BUJYLnSrm5YBxCFl4uhkcgJhoAUuIFjAZLRBvCtSSve1QjUYLnPcJEud9gjoAmIn3iTKIF8CB4oAaEy/Qd6ZjMXsyXnBpz8cLLuureME3+nMd8c3+bPy/+rPxxv5sfF1Xja/rxcZbaH+2vr5fW7+8X1vf0K+tX9Fl662ZoMEADhpgAqlETjvkuAEFt4NgJYMydNA+mEMHFl2bJHoAIwIBhFPoUAggjE0RQHg93QDC1b0dQLiKGptoWiGEFT0VQriKDuUYAhsQMYRJXa047x00MYRrqR1EuIYOsSjCpC6jCJMyUYTuRBGc9wN9PqMI9T0YRbiephNGOKVbYYRvUXccoTfd+xv6dXGxuV9b/3a/tv6dfm39u/3a+o392voP+rX1m/q19Zv7tfUfZoIJgz6YYEM1H0YwgUEwASrJBBP6PJjAkgYTmAgmyMjCIA8mFKYIJrw5YIIJP6LGbX0cTPjRkA4mKAMimFAydIIJrU4wITLUggklXQYTSroTTPjr5++8AgBeKQCw/nk8sdCTsYMtvRA7+HGfxQ7u6Ne1xJ392vrWfm39rn5t/b/7tfVt/dr6Pf3a+k/7tfV7+7X17V22fnsmdjDAYwfyVTCHETpQIHQwXiGZyEGfRw6UpJEDdAXl6m7QRw5OTBE5eHvARA5+Ro2f93Hk4GdpRQ4eHTiRA6iuiKmw3MeQQNJYgNq7oYCTh04oYKcTCtgx1EIBJ3cZCji5O6GA53o0FJAcPrFnIwBSqxTQKiXFi7wlKC8zxg3C5b4v2XLf10/L/Yd6Ybm/q8+W+w/3q/vf3q+t7+7X1vf0a+uP9Gvrv+rX1h/v19af6NfW9/Zr60922fqHKvMd5nLf2+Vy3wclfLhg5z5nue/D5b4Pl/s+7hXLfR/3iuU+foHlvg+X+3i3pyDP2tvDy30vTIheXOdnwafj+GUBKbrO9zqOn9de53vdjp83us5XnXW+Cu8tcK3x8Z6oq5DLYHGEOMhiljfGmVnuZb2Ky3p5EylnMziZmau5Z65xXa/hfdE1vI9nRdfwe1Ou4X1iDQ9vgRVreAA98NTh8Mg1vM+1hvd1ew1/tULVVGv41CudZOsEmmQNH7faQW2gKdbwqF3xMs7cMm5rVLyMx0QLaBHLiQsWtHxArBeI5ZG+hgNRHVAs/BJFvYaXUEAqKnjJIfheZ2TjW12K2FijPIGpPRsNuJl2uVxLbXiMZXJJL9ZrvxZLSyu68E78ApDfxgsJwpJMSnqya79Jt2t/7POuPZ1u117v8649k27X3uzzrv023a69nVbXOCnwYSKEiVEPpX4Wvn5GKYD06EJV10+HrkPwdGSdSV1FXLeYSoFvJl6EqFe+oWgFikVnccVSZsFKnhqKDv+9dulLjFjX+XQ6llg3+fQjKSEkhxByNplDOJlHLHIasbYJ+oM+PUshhPgIIZRYv/HpdDqxXvHpk+CuInzK5WQ5WUkWkRoSJsvISrKCcBImK8lKwslyUkMayMWklljXZeG9N2Xp4ygGxQhpIsvJMrKQTCINJEwmkWUkTBaRS8hqchIJk9XEui5b3JOtT4B7Cgkhp5MVZDGpJZcRTlaSNSSMn0sIJw2khqwQbf0mW6cnEuuVbD0f7huZ0Jas/1Yd679L14+Dcsck6VOYLCeryRL7jtd05Ms7up4FdzB8EusTHdvblKMXwNWxsp9rSQ3Wthg5UYu9C5OlxNqWg+UfdJWPtruahEkDWYal7VZzRKs5OqXE+kT82pSrZ6lybBixbs3VaSOx7srV66DOxYTgKHzFVVsRGS/5tJgsQw6K0VlDLsHeAS8vIWuwB5wsJLXyb5hcSmqxBCcleNcKfKZSUk6sW4cJHg7TJ0K7x8c8yxqUieVkElmBrUBtDc5TDRNPNSzKy2JifTJMv0EpJvBvMikmJaSYlJJiUkaKyRRSTMpJMZlKikkFKSbTsMRk/FdCJpNSMpmUkclkCplMyslkMpVMJhVkMpmGtZRgKfhXSkpIGSkhU0gJKSclZCopIRWkhEzDlkqxJigF/8pIKZmCT1pKppJSUkFKyTTsTRm2VoIlyvDfFFJGykkZmUrKSAUpI9Owx1OwRyVYyxQsBf/KyRQylUwhFWQKmYZPVY69LsGWyrEmKAX/ppJyUkHKyTR88qn4ZCXYm6nY2hQsMRX/VZCpZBpypwKfvgR7XIE9moK1VGAp+DeNTJNcnCaffprs9TTZ2jRZyrruCJ2NVYl10xH6VT4YLaISku4oFZMaUkwWkmKyiBSTxaSY1JJisiTt0ZtMashkspBMJovIZLKYTCa1ZDJZkvaolpAaUkIWkhKyiJSQxaSE1JISsiTt0S4lNaSULCSlZBEpJYtJKaklpWRJ2lJQRmpIGVlIysgiUkYWkzJSS8rIkrSlYwqpIVPIQjKFLCJTyGIyhdSSKWRJ2lJTTmpIOVlIyskiUk4Wk3JSS8rJkrSlaSqpIVPJQjKVLCJTyWIyldSSqWRJ2lJWQWpIBVlIKsgiUkEWkwpSSyrIkrSlbxqpIdPIQjKNLCLTyGIyjdSSaWQJSlUNSkcJjlANcnoKPm0N9roC76zBfwtJDc5Si0kNqSU1ZAlK5EKUrBIc3YU4SlOQUwvxiSuw1YV4N/xbRBaSxWjFFpIlKM2LUCpLUDIW4QhPQS4vQm5VYI8XYctwN/xbTBaRWrKILEFNWIwSXYJStRilYwqO0GLkdAU+7WLs9UK8czH+qyWLyRLUolrUhhKUyFqUrCk4urU4ShXIqVp84oXYai3eDf+WkCVSC5dIbVgipXKJlI4lcpSWSG4tkb1eIu+2to3R6fnEenCMPgdswmy04JNRm8pQDqfiCNbgsy/Guy4mS8kyEiJ1ZDm5hKwgK8kqUk8acM5ZQ9aSS8ll5Bvkm8S6Ll94KPl6liZnOYVYP8/Xlcg/g8Tak6/79+744PITX2pvOXdqUeHP/j0dva4WIB7I1/2++e27nn2xnX+0/xXfHWN3IbEaiOvH6v75M/2Xrn2x/ZK5v3jxxwsLBLESiK1jdf/HE6+6Z8yL7S9evP22N6546yGxh4dtfka87NLvX/TwC+37vzD+u8vyVXEnwTbH6v7qsY9cW/NC+2+uOHP2pFeOPBVp+/8BbR6t++/auLFYfaH9ZP3yv/y96jXR291AbD1a989e9tUz73y+vfp7X974+H1c3BkB4p6jdX/LTT/8/WnPt3+n5VcvnPX14wSxBYgHjtb9/MDO1995rv2VCQ/cfMx/HS+I1djmMbp/0x+OXHD1c+3B7b/9xcin8lzE1hTESmzzGN1/2W//Y41/rn3t775SVLhglHhOjm0eo/tvWrbnpr3Ptqvz3l760L3HSiZgm8fq/rt+8pPzL362/eBdl5c+fuyxkgkfQpvH6v7ZP/3Xtdqz7UsWaP/32F3Hizt3A3HPsbp/8+rXC7fsax+mfNj017ocQYwA8cCxun/fz753XOW+9uaJH972YPnBh6LE9Tw5sQXb5Lq/8sJLRu/4bftV02/+yQlfy5VMwDa57q9+7df3HHymvfDejbc+cPwEyQRsk+v+gyes8I57pt3oCM6bM8kvmYBtBnT/7jl1gfOfbs9f+tQvv70zIO4k2GZA90d++MRHN/ymveyK25fO+cY4F3FPCuL+v0ObAd2/eWJ44yO/br/hgWsnbz/7KEHcDcT1pu7f3XL2k39/qn3J5qeDi87eKWQoAsRWU/dvf/3Yhwqean93z6zXFl933K4ocU8KYgu2aer+uR/euuCcJ9v/9MIe9f89e4LUFWyzQPfv47WR5r3tWf9+tbl9l80hbLNA9+832NU/eaJ9/hlfadj8qpu4JwWRY5tQ7VFvD3/p8fYlr//PltAbhpQhbLNQ92/euqq441ft0+Yat3/xtmNcxNYUxP0fQJuFun9765/ePP5X7Tec59187R+4FDAgHijU/S2/Xj7hrMfap182pWZPjv/UKHH9ccmJESC2Hqf7Nx/DP6l/tP3keePO2njZ36SpwTaP0/0Hj/34nO8/0u57rN5ffH2hZB+2eZzur5704gkP7Gm/ccuI0T9uOclFXH98cmIltnm87t+8r7Hp5d3tH573zqYbl2WfGiXuSUHk2OZn1e5/dfK332tv/6B0y/nz1sjBJkC8fJw+asIK77iH26eTgyecWHbCqVFaW3La/r9Bi+N0/+7zbph34UPtnocvmv+1nKMlZ4F4YJzu33/GyZd8Z2f73rvPe2fKNGmikLi+KDkxAsTWIt0fmfzSzEcfbF967qSzxjce6SLuSUFswTY/q7b6zWueO/iL9t+tLn1y6g+kLanGNsfrfu4JevN/3v61Cx+vOY9JK4TE1hTESmxzvO7fn3/jy9b97X888l+/+d2FJ7qIB1IQObZ5gu5v2fLX8tr72rO23LD2wsaRkrXYJhBH7C7Ovrf9298q33Db1ye6iHtSEPcfhDaBeFT976t+0n7mqpfe/OblY13E9ROSE3cDsXWC7t9d8s/54a3tf239oGzWJyfuihL3pCBGsE0gfrrjqtu2tN/96fH/eID9Y3qUuP7E5MQWILadqI+6bNgtl9/e/kZWU+PxLeN3RWmPJKdVY4sn6v6WF735O37QPu3Of3933vVFUhWAePlEfdQn2+/afUP7rXc+/8/GY/74UJTWlpzGscGJ+iij7oT9ze1vVP4uN/j6UbuitNeT0wjQbjxJZ/D585N0Zff7UNFJ+qir1+QZLcF3Jvzo5ronpLFqAdqBk3R/y3fnn8s3B5/76HXPea/ZzgQQL5+kj3qy6LjTbwqW5Swo2RmRlpUArXWS7q98++oLrEjwKy//7fzdI6gcu79Ci5P0USe98NMlPw4W/d+uNatHydFpAdqBz27cffvIu793V3Dd8Qv2ff8bsu+VQFxfrPt3//7p1b/eFvQWvXLaB0vHyIcGYisQPbsnv/vT4H+d8uScL4wYJm3nX0AiinV/9axnT/nBfcFbbss994ISewIB4oHPiPuf3fqPXfcHXz771Tsu3CslvxqI6yfr/sgPzlrw558Hjzn6gumeZbK3lUBsnaz7d7+b/Tx5IFjylx/99/XHvCfEhWCbnxErv37BhaU7gr87bdfJ548okDx4D9qcrPur77l+b+iXwTeXfjShZfORskNAXF+i+ysfovM3PRR8ftuCx5+dZTs+QGwt0f08e8O0Jx4O7p/51r1Ld0+UHQLinhIwj9O+/U578P+yW+e8VGabR2wTiOMu/5Z/T/AD78RnLntfTuv7/xfaLNX9BwuaJty9J1h2c8WMb22VTIgAsbVU97dszKl59pFg68/W/3r5jxRprIC4p1T3b87b/knto8GrG75UcNekxwUTKoF4oFT3by/dcOq3Hwte9ov/m/eNDdJAcmyzDGa0N94c96vgE+uWvflOqXzO/e9Cm2W637ju4bO/9njwspOmn3jtb21vAYh7ynT/qjXXHnHw8eCBwK1vXj/CHk8gHijT/XNnXHn91U8EtS9+e5WxxPaPgXj5FH3UtP+99+G9wWdP/PPd8071Su4BrW2KPuqj1xYseDK4siMyv+gDr7Rj2OIU3b//mul/+e5TwWWBc+d+sUEq8f4/Q4tTdP++8772yuRfB+8+sO3s66dI9243ENeX6/79p1Rcte/XwV8cMe/rj31JDlgEiK3lut84+Ph/Vv4m+NyEG3/V8N7fhI5XA3HPZ8TNL2w/9b6ng1O25310QodUsUpsE+58u2PYV54JFn9oVY874hHBdg7Ey6fqo37/xj3/eCY44lu/rM0LPCVqJdjk1M+G5P7lY2/+bbD4jzlPvffrfMnYd6DJqbp//lnVFfX7gt8++y+jXr31Y2kdgXhgqu6vrrl44mP7gn9+d/qoa0dL764FiOsrdP87IF3PBscevGPRsIBUlGogtlbo/o+3/fr8umeD60fd8dHTP7SdKWzzszuXLlh0c/uzwQd2nfblv9xpzzzYZoXuf3DYJTNHPhd8d+esnX+4SnoD+9+GNqfp/s2vNR58+Lngh+rcM/59q5zVdwOxdZrur37+wN9GPh98cHrg+W++LkcsAsQ9n91pPLz24rrng3sv/dv2p1eMkI8CxAPTdH9x6aXnPPJ88Pxdnl/MO2W01D9s82Td/86LBT876oXgj/Zvfq/8DZ98FGzzZN2/t/6R6+tfCK556eKsZ8ZNkhYK2zxZ9xf7b9v/5AvBH7+SnX81ly4RwTZP1v2RCu9PzReDX39i8fpVD58kn/MtaPMU3b9v71c++q8Xg+9XXvDXv9wjZ/XdQGw9RR9e/fU/7nrxxeBrtT/2naBn7yLWw6foHww/GFzRvmnMnFNumT6l9D//feo/3w9e8Nortx5ZXf9QTculX/jhe+8Hn11ylfHNCzc/dGXzinfy/vR+8Mh/XjzlnOeumx6+Mu/57f/v/eC/v/WvgpZnrn3oD//8/fi6fe8Ha/a+VXP2R9XT996yZvTMJ94P3vx86XlvbNk8fcPfH3/qCw+/H7zkvzZccOf/7+VJ4HLMvj5vCvVGREYMJUOSpAXhye2xMzVlEtFQtEmrViSSdmkhQ2Syy0ybvcxjXsZElLRYikrZ2p+ntKe8X899n/Rmme/7f9/v9+mn53fPvffcc+8995xzzzm3o4cJubAOJ/OrDOpiug+MuRpJtC11Vz+QxKD8eE03/b/mE6fyC7XrTjOI7xIdpjtgCzW28GOq3TEGDb2pOfXn1YeolRbyebyDDDKr+SmC8TehcrScbt0MZ9Co5icZE+/HUOUaF1KOBjAo1eyX6teF/sTKyLNZR3YwaNnBszUKY/0p35V+RLo7g/S1y8walKKomv0Reh1bGCQwHYEiwvYRXtmutRbWDJpcO9w7vvhX6vEvkoHlFgyy0pw7v63uKPF7xmatkFUMOq4XnB1QGUWNK+5SMTFi0P475xaRruHE04hNofOWMMhP8k2a1A5/4tcSv5jliEGxiYmvuyN/JfQ2ebns0GOQ3zLP96M3hBDo3CXjXC0Gva9UOqK+1J8o3fnKdrE6gzYM3op803+l9li3VLz8gUFaf0g7V7QFEBVlSi3HxzOoU+A65tgEfSq6+Hne7tEMuiIj6x4wex/BH/DmXJA8g6Kyc8MOjHQhVmvOv5Aqy6Brf6QZeRntJRSua8l8HMggQ8+kV7wFwYRWkWGXG49BK9oL188pjSKEo2wuDe6ikaRF5Dz/08FUY8IBy8xWGm02+TGnfsUBKvvC3NnnG2kUqbFybPugOMquSMo5pY5GBbNi51flb6XaEt7qvqikkcLY3MuKinHU28QRdzRe08jZcOr5ZQlBhIquvOG5MhqFO0zZYSV/kPreP0ly8XMaWYR9tyzqvDk1dXrbBJmnNBp7dLn9sWk7qcOJJsUt+TQanvS3Vb31QkIjbKPV4FwaMTYD50nb/UqsgXH15AMabR9w8nlFjguRR9y+euoujWbIy6FI4UGirPBZw9Q7NEpL3fFnbrQ3oTp11pPnAhr5lK+qvTnuIDGktDvuEkWjyNNbQTc2ijo/7bj3pQwaLT99sCSnLIRaYPfo1PNrNLLUk7t5t2wbFWB8fLX6FRq1/uJbt0Q+mJI7sP7BmYs0inzWPVpq5kHiuerVWUtTaSR1LFzz+hFfovve4cfyyTSSXvX9qwrraEJt1bLSQX/QqOauoknQPV3i+pK14ZMv0GjmLRv1d9qxxLIJyQqu52mU4B23ccWbCEq6xDuj4iyNEo2YeZk6EVSQ2dy0XWdolFKtHrbNNJBSvpOju+Q0jczNV28rzT1ITVIxC9A7RSMbxV3+vw9bQ3hcMHxsdpJGU1Q2CJjLB6mH83bb/XaCRgEZuiHJ8lsowXO+l/wJGtEXnNMZe2tKc4wtcSmBRitDy1fpl/hTgbErO/wSaPRo/rpdNkrbKE/LuiqvBBql+e27tYIOpjz3nF12NIFG4e/MxmsrBlP37Resrk2gUeFj6Q3Z8dEEWl9m7HCCRuPOGmWUaPtSIbxaj5EnaeR4y35Vd10soX17Bq/+JI3MnJ7+UVFrS2z66dGsplM0WvDosmbmyVBKfsz8VapnaKQ7e17jNYeD1Ihcw7iwszQaL1ScG7jBn0q+N3HJmPM0clnjXmTyOJaqP7DoWHEijSB8qIV9cjQRZxdefO93Gl2pabiteX0/8eLE1AVvk2gkrMyMt7pmS0UsujpKO5VGiyyb1u5t9SVm+SjEpVyk0V798eeVpA9Sd4UxfIsrNFIb77Qv/cJ66m3mw7TZ12m0NiN6Z8dEJ0ru56zsRTdo9HtHs8rChQcok5/KEgJu0ujHSLtnTg+CqBuDHrg13qKRam6MelfqViK64XRAzD80+tNDpmJmgTMxceJrRessGlmrbFKRzAyhbN+u97XLodETrVevg7/fR+horKg7lkcjhT+pwvw/Y6j1k+ZfGvCERgVadLxWTjRhfnnGiN+KaXR5nYdLoEMgIejebuZYRqMrxyMPP3wZQO1oKhQ4vqZRiE72AZ8xEURy4bq4hCoadRbnr4jyjabsru1XG0TT6EZKyeriO2bUBwXj9FNNNDJoPac/9Ew0NXft2/3uHTTSPZis1/x0M7V0w4f33kIazQw3d3xFx1ArBp6ckSbFoIelljLPhJ5Ewe0fo8fLMijpyIHODzdjKOnxzyz+lmfQZdnUGSkuHkT8z0GlxxQZFNud8Iv260hiR57Q8g9lBiWtlc6PKg8kfsxfM71RlUH2Y37SS31oTVytHBjrrMmgzYoHnKY52hMO0UyJ8mwGFVzN2Ts63J/qvLPejI8Y5NopROuTo6idYYNWaCxl0PILXnopQ6Kp92FDBocYM+j8IP1zQac9iZAzH0pGmzNITsVA+beYAOrI3vujXlsxKOnA7Scm6yKJIO0XA945MOhHR17S2rmBhNUVXtMEDwYpzb8yaMKTAMrymK/O4Z0Muj9k6byMqWGU2smWkUuCGVQYOtdK8pon0Yr2VU6PZtBW9+Mr6zL3EnsN731YeZRBDTGFUfJtUdTz6DOnUs8wyM9z4qsjKfupRvtIjWWpDBqs/DtJ3YkkVNdtpMfeYJB27YU7seqBxOEbjrPVMxlEB+VrXbAJJwwWu1h45zGo/vW8NzdmR1Ij/4pP7n7BoOMPY4zmhfkQRdG/7bldyaCwHCvytpQp0bg1Sv3vJvbmRWUD9ixnZUNf4FELyBIOXiUO1wayi4OH5ojBdYCMzxHBE8XhukBSHDxLHD4TyBIOXiUOnwVkFwcPfSgGnw1k/EMOvzhcD0iKg2eJw+cAWcLBq8ThG4Hs4uChuWLwTUDG53L4xeHWQFIcPEscbgNkCQevEofbAtnFwUMficHtgIx/BDg6kPQI+AsMei7XboMA8iYBNEwCGDYZYMZkAJPJAG6TAaJ7ymk95byeckNPeZgqwAxVABNVADdVgGhVILtYhGyYPQ/4CgMBYBgApKmK/hvgMpmUJxo0PQ/4RiwxS3qudmx+AhvBZmMMi8ABPHAcxB1ccJSajcyvxpF6Lxzx/jwCPh/0QZllkIh8EKUj5ANfi8U9FS+wB3iALY5tO8F20IRleAQ29m6PY+3OvfHuHLZ/PJBF+cDfx2MRBALgcAgbFBGRtwp3sQZHHDT5n5HGhuSn4hSD/2SaU8R6knUFoj1sLwA+nyeK7rLvloCMKBTVHCkEvvxwLlWkfIrILPdXAzKJbbATyPRC4Hvw8GpDv2i/MdiBKZ4kS4gdOOB4GJtt0EfOIlzvgNfpv89BmCGWgzATyLTHwPcf3J500XHKD20I0h7SltIVgpM5BXZtFa0I8rxvxgaWC8Ifzxiqf7IVQXtVykJeuSDIKU+7bmMrAgP+rMyPZYL2I8MPdU5sRVB+fUxxd6nASeLRGYvKFgTR92RThCWCdOMJ66SSWhCc6B6uJ1kiGO8ySq5+awuC8rna9vwXgpnt/LXSc1oQpGms01R4LihN3lhvzOupt2pft3tCsSDPd1lk+oNmBNFb04xmFAloY50rcw41Iyi/0BFGPhM4PEl9mc2GJaIVr6qbPRWYZrz5yU6jpzzs2KmJjk8E54rGDed9aEJwwlLOdu9jwSxz2euH7rPl1tnVxwsFK7qvrfg+rgmB1X7TkzcKBFfjymUjHZoQGDww2FucL7hUOSLgzdye+nKDuUGdeYKLN4MUFYc0IZhRqR0/Lk/wbOulB5NYN7pV5ym/oFxBwMMRjySvvEfgr2+dVZgjMMneOS0t9D2CEyMNB0zOFrw1irVW2dDTvtxY8/ud9wUXFYL1V+v2tAd/JPH0nkAvdf7rJXy2XmrMeZ27gtLTD7vpV40IYE11S+w/ghlz+OYr/mxEcKL8hzcdfwtAZXegaWwjglvd69Zuui0gnj25NdClp73/Ta+j8QLB32+uL7VcxtZ3WKzxpQT5QZBsPpGtb5a7a5UhUFUxlWv42IAAri19ZXhNEDU3z0f5RQMCA96lbeiyoNh/7dN313vKtxaM8dNLE+w38P04/xDb/urgA66/C/bOy3wwyYMt+xgf2nFG8MvYIW8Or2TLspmJE48LTkUq346ZwZa3qU3eEiOYsOvypGHD2HJVUbuyj8Dx/IOOXay/EEwumn4MRoGNrYW2i3rK/nIVOd+fRLuHBSYMyqER+O+L6DJKQlXrDsfNXUMjMFgzXvv3y+id/s2Gp2/r2fq8E6Mz0GU94Z5rPvUIDCSfV7v/hRZWG7lfla1HYLXbpKDkNrL2Glpy6UwdghNlA/7w/getzH5aFYl6ysqvfBYOuocMZSWM1UtrERhc2FcWeR89ULACJ79aBOUFW9KH5KAonekus1gnU3luqkxgLppjojbZLbMGgb/9FZnteahUS5XiOdcguMXbLJWUj/Y1IqpwVA2C8o+Ph78oQMkf7Zfn/12NwD/zpyUDHyOJuJ3Nb9yqETTMlf5L4wl6TwXM+cC6WvJMlKNXPkWNa9tCeIVVCBpqHhZsfYacWzNq3wZXIYj2C4qPLEKxGebXDhNVCKwqzHiJxUhl2F2hVHMlgrxCl9F/PUcPFEaOVkmuRFB+IuV93gsUIfyto8S+EoGBQP9MeQkCMq2ElQORMhnyoPwOSV1bNPAPyTDinO4aSbB6hy60bao5JtxIZL6fdEeY8A7diCayH+0KICTXZeixPoTJBz1WhwpDidexceVCpUp0McBS1aA7nBg2dK0C69cg90684tXtTj2xsJVnPSTe6j/sfDd4G3Gueq0262u5rtI6+c3gTVTBpSv1QqUqpHn/7PglEoHUna5ODdbFo3T0/anmNmfCxDGiTZhQhboPLZc2lYyk7BTs50B5FVrse++vJslwavF3gldCpWpEKA810O30ofITfskRWlaj9Q4npPyF3pT90hvzWM/YgF11//zT7kac1cioFL6sRhJLIpYW744kUrunPxMq1aBdKQ+NzGS3UIeEkmVCyxrkeKk64oJfMKG+f8MDYUINKhthePV+YABVMyC5VPiyBhHTrWqy5M0JI/0hjUKlWhS/TTW5tDOSWjdqQq7QshbNlr+r+F22KeH5zqRYmFCLIDeWLG7zIFIT40ewDtJbx9ZP+EfGi4h7ucQClOvQ/dvVpudoRyKlLcOA9cs+dVuhmjBoJxXebbaJdeIqGVZ5G/B3UOulDYuFL+vQs6tHO3Q6QolHT706hEr16K8KS7vB08ypg9+vPiW0rEdNhwqOTZH0pWT3qRwXJtSjWafkdFdKhBCjdlG2rAtbtujMqPE8LypmaasE6+8u38RIa/qHEUXnnq0BKxp1tsmae/F3UbK36lXhBI2GH1ksvTcwgtqZ3eIE5TRq9lY4pOofReX4qW8DZQZFmXq6F++JomQWy04GKwaVCFVVYasBpfMkokqYwKC0xO6KkrHmVFiw3BPhSwa5RMZkj+kIIewnqkmyQYY9S7Rtm3YfIzY/ff1aaNmAfA+llA7uDCbWnA+SYUMpMR8K/cteraFykOUYNpwzsiFTSicghmq5kdouVGpEf9/wt/uzcx+VHGP0VmjZiJjK2d/J7z5OVcxKGs4GyIQto6RkIJ5YtiBLkQ3SnVj//M2HgGjKZcNHOTYSuPBDvGFedygVU5QwmQ04BuTHbp/6MYJ4/u6cGhvXzNy3YauHhBs1Z75aufDle9Rx7tLzOTuPEQENJW1CpSa06ucSF51GP8Jq37oGoWUTqtV6aLh6wG9UTsrQ6WxY2edM4Y+VDV7ErEvzJNnotU7o8ZHZfvGEMCRfgg2ST9HXeJQ6eBdxcafeEDbcfi7ONmj24AAiLGG1JBu4L6CMo3/pDKOaFs6UZPMD1Ey/q580fBslt1siR6jUgkpW+QQW7T1CuF4O6RZatqBBU/K0KqVDqBtt494LE1qQhK/75oS2EGKPblet8GULml89Y3q0fwwFJPUG+LwIILPeAH8vtrN2/od2lshAYZNT+owQAttM/xtbSw3InLci07HoLXwtTZLFIkqftcYpmSxt2z8lwb7jzM530Jem6gUuOAnWDSf1eOK0HmVsdrHpuGTOO5EZXPQO+D/yuKzkL03Vn3FvV3DnUor6aPaA5RirO6bLtS9pM6mSM7Argb+cxbwAABbitF9r8MK096aSGoErTjTtNfn60oMXwza8Xm6fYGREFfB5hkAeqQI+yeKd+1myrzGX7GuMk30X4ORfttbj6/hKWHxOQFZVAd+SxWeOE5Q+N82VMb3ia6DMpe1+mxPYlbfn5uMNtjAdyJxqkZVcVA19CdXiHEXWVYvWrb0a+KZsC0NsYTtg+kWJzB44Vdj2U0Lz5q9Qy1LqjfdFRKt40nMNt+c1YlcfZfDB2J1w696+dhz/KoMHbMZz98S0uOA9t8dtRGN5YRiZVCs6Uum1wN/O4nbHuMV/xGfb+2OCMVlzHOGAzwWbYu6K+d0J840Xxy1aoAlTQAs0vtpLDWRABkiqTsQlWXXAX8jSQXyVr7+G4Rv8HFHP3W/qxW6v04FM4uDp4nAZIHPqRZfQonrgK7Hw0QAwESzACKfZuXyauz5ODK8Xnd1QWuzcTwNlnJZtA4vAFrzBod/Z+NSXokUjZdHQlya+HmS40TbiU9FvtDpaNFr756P1rbj4rvbrm8SIRktnvjLaAvDCstKWu6DhHiWMaLQq5ou5ecGmL/r0Gy2+gfM9NIjdN9fjHWZrkoDMagD+aSy84wFgFRbcyngamzn2/NrxcMBiiGVDGyzExA+zB36XsBkvtjLY4PcJvQfbDt89Rf1FrUQH88sxVDG879hNB7KuUSRq2huBb8HD1H6NKd04hWOL8zl7hTzLrH1w8hNcJFI9sfD79F6h5D235O+h70VEnxrxhO1YIdh8qUTim0QHJ7EJ+Po87Hhi32544hGcOcHJzkgZU2ON18sDl3rXpVcQk3UcrvYm4M/k4eMi2nhWPG7HdIvEqAMWLF54BwzF3j+wzN3MMXcz8McM595opM3hns7MFX3cBgJZ18zxdPNXNWffRDeBF05KFXtgkNTCSa0W4Puwfd0A8FQ8cKteremBpeHn0xSXzF8+MVHG7gpvziHhBu5Ytjp80iHOmAEcWSqoVtEMslqBr8PDSwVijLzsG1K+94xOAbKrlXN8tQF/HIthFAB+yiHaHHF9RSa1iTYnvQ34iIc9hn16pu85jvunw9Cf4V2xdhMxOTtyG+fbaxeTgmpAxreL5pTYDl97zmODKduIV8QWfD6xb7vIVVTVDnxXHrbJWNtBXMPa4gPsyunBb2lAF4zdAVtbIqb9XCeLryE3l5IO0SpWdXx1FfuxeESnSJce6RSzcqZxWEU2jge4cazeS4MnJ6TE90OcYyyArOvk/GydYus5DciID5yN9wH6nlZ9KUL6Vqff86CcD5z18eEbPro6rkH7txpEdHFasOtbXj6uQfq3GuR0cc7NLnHnpik2L3rNDxes7kTMJzKl2Lz2LZy378tlFJcfytg82iFmHm3k5LcLaPSTrX0sIpKdZF23iO3au4Fvy1K24Qu288Bq6ssxxV9tTcNjenAm41ZOp/QKEaf+8q3uI6cTPoqZn73H0AOLByfc58uDKGLe/qb0v9HFqmKhiF2rhGKm3/9VA3HMRfnz8Opl+fO+tXpuOIvfC4sXT25fe7H07tbnc/63GZHUHh5mpqw9PH4QZqZdYkaAuKQXKXKRcu8lp7+EEDHK16TsFNxDud8zPWv8cNERyy3WLOi9ZagBWRLAw5ZJVQCPfxwT9ev/E1Gr8bXz88P/r8RGBIp27Uggr0/U+nDXHPGz9LmvXRvzuS7+rYd/u+IZsTQ4Y6NzDYfFlMPBXtIWwHa885yojQjiYVF7JIjHV2BHH8qJ2k2f2pEU24ZVi0G8vmiKMWyCLdyVVhmvgDs2q20wJ7nhmbuI+LSL6x8azOsTmf37O/TbgX69bwXz+EPmcIpL9EfayOZgHl9Bgux9vSsSzuw/PpCxITw+zwbIRPY7BEiK/SoDmRPC4w+XJHtxfMJVxdZ/B2Qz+z0DZGgoj89TBDKR/SoBeSWUx5f4gQdkFguYAGQV+1UFshlXSAAZGsbj89SATGS/WkBSYTz+kD0cVTwJ/OaziK3TAbI5jMeXElE8eZiHq5e7ta3RRjc3Bxd7s58NR07XdHXzdHB22GFrM91no4fzdOeNbv8Fu4lUDg==";
  }
});

// node_modules/base64-js/index.js
var require_base64_js = __commonJS({
  "node_modules/base64-js/index.js"(exports2) {
    "use strict";
    exports2.byteLength = byteLength;
    exports2.toByteArray = toByteArray;
    exports2.fromByteArray = fromByteArray;
    var lookup = [];
    var revLookup = [];
    var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
    var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (i = 0, len = code.length; i < len; ++i) {
      lookup[i] = code[i];
      revLookup[code.charCodeAt(i)] = i;
    }
    var i;
    var len;
    revLookup["-".charCodeAt(0)] = 62;
    revLookup["_".charCodeAt(0)] = 63;
    function getLens(b64) {
      var len2 = b64.length;
      if (len2 % 4 > 0) {
        throw new Error("Invalid string. Length must be a multiple of 4");
      }
      var validLen = b64.indexOf("=");
      if (validLen === -1) validLen = len2;
      var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
      return [validLen, placeHoldersLen];
    }
    function byteLength(b64) {
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function _byteLength(b64, validLen, placeHoldersLen) {
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function toByteArray(b64) {
      var tmp;
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
      var curByte = 0;
      var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
      var i2;
      for (i2 = 0; i2 < len2; i2 += 4) {
        tmp = revLookup[b64.charCodeAt(i2)] << 18 | revLookup[b64.charCodeAt(i2 + 1)] << 12 | revLookup[b64.charCodeAt(i2 + 2)] << 6 | revLookup[b64.charCodeAt(i2 + 3)];
        arr[curByte++] = tmp >> 16 & 255;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 2) {
        tmp = revLookup[b64.charCodeAt(i2)] << 2 | revLookup[b64.charCodeAt(i2 + 1)] >> 4;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 1) {
        tmp = revLookup[b64.charCodeAt(i2)] << 10 | revLookup[b64.charCodeAt(i2 + 1)] << 4 | revLookup[b64.charCodeAt(i2 + 2)] >> 2;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      return arr;
    }
    function tripletToBase64(num) {
      return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
    }
    function encodeChunk(uint8, start2, end) {
      var tmp;
      var output = [];
      for (var i2 = start2; i2 < end; i2 += 3) {
        tmp = (uint8[i2] << 16 & 16711680) + (uint8[i2 + 1] << 8 & 65280) + (uint8[i2 + 2] & 255);
        output.push(tripletToBase64(tmp));
      }
      return output.join("");
    }
    function fromByteArray(uint8) {
      var tmp;
      var len2 = uint8.length;
      var extraBytes = len2 % 3;
      var parts = [];
      var maxChunkLength = 16383;
      for (var i2 = 0, len22 = len2 - extraBytes; i2 < len22; i2 += maxChunkLength) {
        parts.push(encodeChunk(uint8, i2, i2 + maxChunkLength > len22 ? len22 : i2 + maxChunkLength));
      }
      if (extraBytes === 1) {
        tmp = uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
        );
      } else if (extraBytes === 2) {
        tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
        );
      }
      return parts.join("");
    }
  }
});

// node_modules/pako/lib/utils/common.js
var require_common = __commonJS({
  "node_modules/pako/lib/utils/common.js"(exports2) {
    "use strict";
    var TYPED_OK = typeof Uint8Array !== "undefined" && typeof Uint16Array !== "undefined" && typeof Int32Array !== "undefined";
    function _has(obj, key) {
      return Object.prototype.hasOwnProperty.call(obj, key);
    }
    exports2.assign = function(obj) {
      var sources = Array.prototype.slice.call(arguments, 1);
      while (sources.length) {
        var source = sources.shift();
        if (!source) {
          continue;
        }
        if (typeof source !== "object") {
          throw new TypeError(source + "must be non-object");
        }
        for (var p in source) {
          if (_has(source, p)) {
            obj[p] = source[p];
          }
        }
      }
      return obj;
    };
    exports2.shrinkBuf = function(buf, size) {
      if (buf.length === size) {
        return buf;
      }
      if (buf.subarray) {
        return buf.subarray(0, size);
      }
      buf.length = size;
      return buf;
    };
    var fnTyped = {
      arraySet: function(dest, src, src_offs, len, dest_offs) {
        if (src.subarray && dest.subarray) {
          dest.set(src.subarray(src_offs, src_offs + len), dest_offs);
          return;
        }
        for (var i = 0; i < len; i++) {
          dest[dest_offs + i] = src[src_offs + i];
        }
      },
      // Join array of chunks to single array.
      flattenChunks: function(chunks) {
        var i, l, len, pos, chunk, result;
        len = 0;
        for (i = 0, l = chunks.length; i < l; i++) {
          len += chunks[i].length;
        }
        result = new Uint8Array(len);
        pos = 0;
        for (i = 0, l = chunks.length; i < l; i++) {
          chunk = chunks[i];
          result.set(chunk, pos);
          pos += chunk.length;
        }
        return result;
      }
    };
    var fnUntyped = {
      arraySet: function(dest, src, src_offs, len, dest_offs) {
        for (var i = 0; i < len; i++) {
          dest[dest_offs + i] = src[src_offs + i];
        }
      },
      // Join array of chunks to single array.
      flattenChunks: function(chunks) {
        return [].concat.apply([], chunks);
      }
    };
    exports2.setTyped = function(on) {
      if (on) {
        exports2.Buf8 = Uint8Array;
        exports2.Buf16 = Uint16Array;
        exports2.Buf32 = Int32Array;
        exports2.assign(exports2, fnTyped);
      } else {
        exports2.Buf8 = Array;
        exports2.Buf16 = Array;
        exports2.Buf32 = Array;
        exports2.assign(exports2, fnUntyped);
      }
    };
    exports2.setTyped(TYPED_OK);
  }
});

// node_modules/pako/lib/zlib/trees.js
var require_trees = __commonJS({
  "node_modules/pako/lib/zlib/trees.js"(exports2) {
    "use strict";
    var utils = require_common();
    var Z_FIXED = 4;
    var Z_BINARY = 0;
    var Z_TEXT = 1;
    var Z_UNKNOWN = 2;
    function zero(buf) {
      var len = buf.length;
      while (--len >= 0) {
        buf[len] = 0;
      }
    }
    var STORED_BLOCK = 0;
    var STATIC_TREES = 1;
    var DYN_TREES = 2;
    var MIN_MATCH = 3;
    var MAX_MATCH = 258;
    var LENGTH_CODES = 29;
    var LITERALS = 256;
    var L_CODES = LITERALS + 1 + LENGTH_CODES;
    var D_CODES = 30;
    var BL_CODES = 19;
    var HEAP_SIZE = 2 * L_CODES + 1;
    var MAX_BITS = 15;
    var Buf_size = 16;
    var MAX_BL_BITS = 7;
    var END_BLOCK = 256;
    var REP_3_6 = 16;
    var REPZ_3_10 = 17;
    var REPZ_11_138 = 18;
    var extra_lbits = (
      /* extra bits for each length code */
      [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
    );
    var extra_dbits = (
      /* extra bits for each distance code */
      [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
    );
    var extra_blbits = (
      /* extra bits for each bit length code */
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7]
    );
    var bl_order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
    var DIST_CODE_LEN = 512;
    var static_ltree = new Array((L_CODES + 2) * 2);
    zero(static_ltree);
    var static_dtree = new Array(D_CODES * 2);
    zero(static_dtree);
    var _dist_code = new Array(DIST_CODE_LEN);
    zero(_dist_code);
    var _length_code = new Array(MAX_MATCH - MIN_MATCH + 1);
    zero(_length_code);
    var base_length = new Array(LENGTH_CODES);
    zero(base_length);
    var base_dist = new Array(D_CODES);
    zero(base_dist);
    function StaticTreeDesc(static_tree, extra_bits, extra_base, elems, max_length) {
      this.static_tree = static_tree;
      this.extra_bits = extra_bits;
      this.extra_base = extra_base;
      this.elems = elems;
      this.max_length = max_length;
      this.has_stree = static_tree && static_tree.length;
    }
    var static_l_desc;
    var static_d_desc;
    var static_bl_desc;
    function TreeDesc(dyn_tree, stat_desc) {
      this.dyn_tree = dyn_tree;
      this.max_code = 0;
      this.stat_desc = stat_desc;
    }
    function d_code(dist) {
      return dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)];
    }
    function put_short(s, w) {
      s.pending_buf[s.pending++] = w & 255;
      s.pending_buf[s.pending++] = w >>> 8 & 255;
    }
    function send_bits(s, value, length) {
      if (s.bi_valid > Buf_size - length) {
        s.bi_buf |= value << s.bi_valid & 65535;
        put_short(s, s.bi_buf);
        s.bi_buf = value >> Buf_size - s.bi_valid;
        s.bi_valid += length - Buf_size;
      } else {
        s.bi_buf |= value << s.bi_valid & 65535;
        s.bi_valid += length;
      }
    }
    function send_code(s, c, tree) {
      send_bits(
        s,
        tree[c * 2],
        tree[c * 2 + 1]
        /*.Len*/
      );
    }
    function bi_reverse(code, len) {
      var res = 0;
      do {
        res |= code & 1;
        code >>>= 1;
        res <<= 1;
      } while (--len > 0);
      return res >>> 1;
    }
    function bi_flush(s) {
      if (s.bi_valid === 16) {
        put_short(s, s.bi_buf);
        s.bi_buf = 0;
        s.bi_valid = 0;
      } else if (s.bi_valid >= 8) {
        s.pending_buf[s.pending++] = s.bi_buf & 255;
        s.bi_buf >>= 8;
        s.bi_valid -= 8;
      }
    }
    function gen_bitlen(s, desc) {
      var tree = desc.dyn_tree;
      var max_code = desc.max_code;
      var stree = desc.stat_desc.static_tree;
      var has_stree = desc.stat_desc.has_stree;
      var extra = desc.stat_desc.extra_bits;
      var base = desc.stat_desc.extra_base;
      var max_length = desc.stat_desc.max_length;
      var h;
      var n, m;
      var bits;
      var xbits;
      var f;
      var overflow = 0;
      for (bits = 0; bits <= MAX_BITS; bits++) {
        s.bl_count[bits] = 0;
      }
      tree[s.heap[s.heap_max] * 2 + 1] = 0;
      for (h = s.heap_max + 1; h < HEAP_SIZE; h++) {
        n = s.heap[h];
        bits = tree[tree[n * 2 + 1] * 2 + 1] + 1;
        if (bits > max_length) {
          bits = max_length;
          overflow++;
        }
        tree[n * 2 + 1] = bits;
        if (n > max_code) {
          continue;
        }
        s.bl_count[bits]++;
        xbits = 0;
        if (n >= base) {
          xbits = extra[n - base];
        }
        f = tree[n * 2];
        s.opt_len += f * (bits + xbits);
        if (has_stree) {
          s.static_len += f * (stree[n * 2 + 1] + xbits);
        }
      }
      if (overflow === 0) {
        return;
      }
      do {
        bits = max_length - 1;
        while (s.bl_count[bits] === 0) {
          bits--;
        }
        s.bl_count[bits]--;
        s.bl_count[bits + 1] += 2;
        s.bl_count[max_length]--;
        overflow -= 2;
      } while (overflow > 0);
      for (bits = max_length; bits !== 0; bits--) {
        n = s.bl_count[bits];
        while (n !== 0) {
          m = s.heap[--h];
          if (m > max_code) {
            continue;
          }
          if (tree[m * 2 + 1] !== bits) {
            s.opt_len += (bits - tree[m * 2 + 1]) * tree[m * 2];
            tree[m * 2 + 1] = bits;
          }
          n--;
        }
      }
    }
    function gen_codes(tree, max_code, bl_count) {
      var next_code = new Array(MAX_BITS + 1);
      var code = 0;
      var bits;
      var n;
      for (bits = 1; bits <= MAX_BITS; bits++) {
        next_code[bits] = code = code + bl_count[bits - 1] << 1;
      }
      for (n = 0; n <= max_code; n++) {
        var len = tree[n * 2 + 1];
        if (len === 0) {
          continue;
        }
        tree[n * 2] = bi_reverse(next_code[len]++, len);
      }
    }
    function tr_static_init() {
      var n;
      var bits;
      var length;
      var code;
      var dist;
      var bl_count = new Array(MAX_BITS + 1);
      length = 0;
      for (code = 0; code < LENGTH_CODES - 1; code++) {
        base_length[code] = length;
        for (n = 0; n < 1 << extra_lbits[code]; n++) {
          _length_code[length++] = code;
        }
      }
      _length_code[length - 1] = code;
      dist = 0;
      for (code = 0; code < 16; code++) {
        base_dist[code] = dist;
        for (n = 0; n < 1 << extra_dbits[code]; n++) {
          _dist_code[dist++] = code;
        }
      }
      dist >>= 7;
      for (; code < D_CODES; code++) {
        base_dist[code] = dist << 7;
        for (n = 0; n < 1 << extra_dbits[code] - 7; n++) {
          _dist_code[256 + dist++] = code;
        }
      }
      for (bits = 0; bits <= MAX_BITS; bits++) {
        bl_count[bits] = 0;
      }
      n = 0;
      while (n <= 143) {
        static_ltree[n * 2 + 1] = 8;
        n++;
        bl_count[8]++;
      }
      while (n <= 255) {
        static_ltree[n * 2 + 1] = 9;
        n++;
        bl_count[9]++;
      }
      while (n <= 279) {
        static_ltree[n * 2 + 1] = 7;
        n++;
        bl_count[7]++;
      }
      while (n <= 287) {
        static_ltree[n * 2 + 1] = 8;
        n++;
        bl_count[8]++;
      }
      gen_codes(static_ltree, L_CODES + 1, bl_count);
      for (n = 0; n < D_CODES; n++) {
        static_dtree[n * 2 + 1] = 5;
        static_dtree[n * 2] = bi_reverse(n, 5);
      }
      static_l_desc = new StaticTreeDesc(static_ltree, extra_lbits, LITERALS + 1, L_CODES, MAX_BITS);
      static_d_desc = new StaticTreeDesc(static_dtree, extra_dbits, 0, D_CODES, MAX_BITS);
      static_bl_desc = new StaticTreeDesc(new Array(0), extra_blbits, 0, BL_CODES, MAX_BL_BITS);
    }
    function init_block(s) {
      var n;
      for (n = 0; n < L_CODES; n++) {
        s.dyn_ltree[n * 2] = 0;
      }
      for (n = 0; n < D_CODES; n++) {
        s.dyn_dtree[n * 2] = 0;
      }
      for (n = 0; n < BL_CODES; n++) {
        s.bl_tree[n * 2] = 0;
      }
      s.dyn_ltree[END_BLOCK * 2] = 1;
      s.opt_len = s.static_len = 0;
      s.last_lit = s.matches = 0;
    }
    function bi_windup(s) {
      if (s.bi_valid > 8) {
        put_short(s, s.bi_buf);
      } else if (s.bi_valid > 0) {
        s.pending_buf[s.pending++] = s.bi_buf;
      }
      s.bi_buf = 0;
      s.bi_valid = 0;
    }
    function copy_block(s, buf, len, header) {
      bi_windup(s);
      if (header) {
        put_short(s, len);
        put_short(s, ~len);
      }
      utils.arraySet(s.pending_buf, s.window, buf, len, s.pending);
      s.pending += len;
    }
    function smaller(tree, n, m, depth) {
      var _n2 = n * 2;
      var _m2 = m * 2;
      return tree[_n2] < tree[_m2] || tree[_n2] === tree[_m2] && depth[n] <= depth[m];
    }
    function pqdownheap(s, tree, k) {
      var v = s.heap[k];
      var j = k << 1;
      while (j <= s.heap_len) {
        if (j < s.heap_len && smaller(tree, s.heap[j + 1], s.heap[j], s.depth)) {
          j++;
        }
        if (smaller(tree, v, s.heap[j], s.depth)) {
          break;
        }
        s.heap[k] = s.heap[j];
        k = j;
        j <<= 1;
      }
      s.heap[k] = v;
    }
    function compress_block(s, ltree, dtree) {
      var dist;
      var lc;
      var lx = 0;
      var code;
      var extra;
      if (s.last_lit !== 0) {
        do {
          dist = s.pending_buf[s.d_buf + lx * 2] << 8 | s.pending_buf[s.d_buf + lx * 2 + 1];
          lc = s.pending_buf[s.l_buf + lx];
          lx++;
          if (dist === 0) {
            send_code(s, lc, ltree);
          } else {
            code = _length_code[lc];
            send_code(s, code + LITERALS + 1, ltree);
            extra = extra_lbits[code];
            if (extra !== 0) {
              lc -= base_length[code];
              send_bits(s, lc, extra);
            }
            dist--;
            code = d_code(dist);
            send_code(s, code, dtree);
            extra = extra_dbits[code];
            if (extra !== 0) {
              dist -= base_dist[code];
              send_bits(s, dist, extra);
            }
          }
        } while (lx < s.last_lit);
      }
      send_code(s, END_BLOCK, ltree);
    }
    function build_tree(s, desc) {
      var tree = desc.dyn_tree;
      var stree = desc.stat_desc.static_tree;
      var has_stree = desc.stat_desc.has_stree;
      var elems = desc.stat_desc.elems;
      var n, m;
      var max_code = -1;
      var node;
      s.heap_len = 0;
      s.heap_max = HEAP_SIZE;
      for (n = 0; n < elems; n++) {
        if (tree[n * 2] !== 0) {
          s.heap[++s.heap_len] = max_code = n;
          s.depth[n] = 0;
        } else {
          tree[n * 2 + 1] = 0;
        }
      }
      while (s.heap_len < 2) {
        node = s.heap[++s.heap_len] = max_code < 2 ? ++max_code : 0;
        tree[node * 2] = 1;
        s.depth[node] = 0;
        s.opt_len--;
        if (has_stree) {
          s.static_len -= stree[node * 2 + 1];
        }
      }
      desc.max_code = max_code;
      for (n = s.heap_len >> 1; n >= 1; n--) {
        pqdownheap(s, tree, n);
      }
      node = elems;
      do {
        n = s.heap[
          1
          /*SMALLEST*/
        ];
        s.heap[
          1
          /*SMALLEST*/
        ] = s.heap[s.heap_len--];
        pqdownheap(
          s,
          tree,
          1
          /*SMALLEST*/
        );
        m = s.heap[
          1
          /*SMALLEST*/
        ];
        s.heap[--s.heap_max] = n;
        s.heap[--s.heap_max] = m;
        tree[node * 2] = tree[n * 2] + tree[m * 2];
        s.depth[node] = (s.depth[n] >= s.depth[m] ? s.depth[n] : s.depth[m]) + 1;
        tree[n * 2 + 1] = tree[m * 2 + 1] = node;
        s.heap[
          1
          /*SMALLEST*/
        ] = node++;
        pqdownheap(
          s,
          tree,
          1
          /*SMALLEST*/
        );
      } while (s.heap_len >= 2);
      s.heap[--s.heap_max] = s.heap[
        1
        /*SMALLEST*/
      ];
      gen_bitlen(s, desc);
      gen_codes(tree, max_code, s.bl_count);
    }
    function scan_tree(s, tree, max_code) {
      var n;
      var prevlen = -1;
      var curlen;
      var nextlen = tree[0 * 2 + 1];
      var count = 0;
      var max_count = 7;
      var min_count = 4;
      if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
      }
      tree[(max_code + 1) * 2 + 1] = 65535;
      for (n = 0; n <= max_code; n++) {
        curlen = nextlen;
        nextlen = tree[(n + 1) * 2 + 1];
        if (++count < max_count && curlen === nextlen) {
          continue;
        } else if (count < min_count) {
          s.bl_tree[curlen * 2] += count;
        } else if (curlen !== 0) {
          if (curlen !== prevlen) {
            s.bl_tree[curlen * 2]++;
          }
          s.bl_tree[REP_3_6 * 2]++;
        } else if (count <= 10) {
          s.bl_tree[REPZ_3_10 * 2]++;
        } else {
          s.bl_tree[REPZ_11_138 * 2]++;
        }
        count = 0;
        prevlen = curlen;
        if (nextlen === 0) {
          max_count = 138;
          min_count = 3;
        } else if (curlen === nextlen) {
          max_count = 6;
          min_count = 3;
        } else {
          max_count = 7;
          min_count = 4;
        }
      }
    }
    function send_tree(s, tree, max_code) {
      var n;
      var prevlen = -1;
      var curlen;
      var nextlen = tree[0 * 2 + 1];
      var count = 0;
      var max_count = 7;
      var min_count = 4;
      if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
      }
      for (n = 0; n <= max_code; n++) {
        curlen = nextlen;
        nextlen = tree[(n + 1) * 2 + 1];
        if (++count < max_count && curlen === nextlen) {
          continue;
        } else if (count < min_count) {
          do {
            send_code(s, curlen, s.bl_tree);
          } while (--count !== 0);
        } else if (curlen !== 0) {
          if (curlen !== prevlen) {
            send_code(s, curlen, s.bl_tree);
            count--;
          }
          send_code(s, REP_3_6, s.bl_tree);
          send_bits(s, count - 3, 2);
        } else if (count <= 10) {
          send_code(s, REPZ_3_10, s.bl_tree);
          send_bits(s, count - 3, 3);
        } else {
          send_code(s, REPZ_11_138, s.bl_tree);
          send_bits(s, count - 11, 7);
        }
        count = 0;
        prevlen = curlen;
        if (nextlen === 0) {
          max_count = 138;
          min_count = 3;
        } else if (curlen === nextlen) {
          max_count = 6;
          min_count = 3;
        } else {
          max_count = 7;
          min_count = 4;
        }
      }
    }
    function build_bl_tree(s) {
      var max_blindex;
      scan_tree(s, s.dyn_ltree, s.l_desc.max_code);
      scan_tree(s, s.dyn_dtree, s.d_desc.max_code);
      build_tree(s, s.bl_desc);
      for (max_blindex = BL_CODES - 1; max_blindex >= 3; max_blindex--) {
        if (s.bl_tree[bl_order[max_blindex] * 2 + 1] !== 0) {
          break;
        }
      }
      s.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;
      return max_blindex;
    }
    function send_all_trees(s, lcodes, dcodes, blcodes) {
      var rank;
      send_bits(s, lcodes - 257, 5);
      send_bits(s, dcodes - 1, 5);
      send_bits(s, blcodes - 4, 4);
      for (rank = 0; rank < blcodes; rank++) {
        send_bits(s, s.bl_tree[bl_order[rank] * 2 + 1], 3);
      }
      send_tree(s, s.dyn_ltree, lcodes - 1);
      send_tree(s, s.dyn_dtree, dcodes - 1);
    }
    function detect_data_type(s) {
      var black_mask = 4093624447;
      var n;
      for (n = 0; n <= 31; n++, black_mask >>>= 1) {
        if (black_mask & 1 && s.dyn_ltree[n * 2] !== 0) {
          return Z_BINARY;
        }
      }
      if (s.dyn_ltree[9 * 2] !== 0 || s.dyn_ltree[10 * 2] !== 0 || s.dyn_ltree[13 * 2] !== 0) {
        return Z_TEXT;
      }
      for (n = 32; n < LITERALS; n++) {
        if (s.dyn_ltree[n * 2] !== 0) {
          return Z_TEXT;
        }
      }
      return Z_BINARY;
    }
    var static_init_done = false;
    function _tr_init(s) {
      if (!static_init_done) {
        tr_static_init();
        static_init_done = true;
      }
      s.l_desc = new TreeDesc(s.dyn_ltree, static_l_desc);
      s.d_desc = new TreeDesc(s.dyn_dtree, static_d_desc);
      s.bl_desc = new TreeDesc(s.bl_tree, static_bl_desc);
      s.bi_buf = 0;
      s.bi_valid = 0;
      init_block(s);
    }
    function _tr_stored_block(s, buf, stored_len, last) {
      send_bits(s, (STORED_BLOCK << 1) + (last ? 1 : 0), 3);
      copy_block(s, buf, stored_len, true);
    }
    function _tr_align(s) {
      send_bits(s, STATIC_TREES << 1, 3);
      send_code(s, END_BLOCK, static_ltree);
      bi_flush(s);
    }
    function _tr_flush_block(s, buf, stored_len, last) {
      var opt_lenb, static_lenb;
      var max_blindex = 0;
      if (s.level > 0) {
        if (s.strm.data_type === Z_UNKNOWN) {
          s.strm.data_type = detect_data_type(s);
        }
        build_tree(s, s.l_desc);
        build_tree(s, s.d_desc);
        max_blindex = build_bl_tree(s);
        opt_lenb = s.opt_len + 3 + 7 >>> 3;
        static_lenb = s.static_len + 3 + 7 >>> 3;
        if (static_lenb <= opt_lenb) {
          opt_lenb = static_lenb;
        }
      } else {
        opt_lenb = static_lenb = stored_len + 5;
      }
      if (stored_len + 4 <= opt_lenb && buf !== -1) {
        _tr_stored_block(s, buf, stored_len, last);
      } else if (s.strategy === Z_FIXED || static_lenb === opt_lenb) {
        send_bits(s, (STATIC_TREES << 1) + (last ? 1 : 0), 3);
        compress_block(s, static_ltree, static_dtree);
      } else {
        send_bits(s, (DYN_TREES << 1) + (last ? 1 : 0), 3);
        send_all_trees(s, s.l_desc.max_code + 1, s.d_desc.max_code + 1, max_blindex + 1);
        compress_block(s, s.dyn_ltree, s.dyn_dtree);
      }
      init_block(s);
      if (last) {
        bi_windup(s);
      }
    }
    function _tr_tally(s, dist, lc) {
      s.pending_buf[s.d_buf + s.last_lit * 2] = dist >>> 8 & 255;
      s.pending_buf[s.d_buf + s.last_lit * 2 + 1] = dist & 255;
      s.pending_buf[s.l_buf + s.last_lit] = lc & 255;
      s.last_lit++;
      if (dist === 0) {
        s.dyn_ltree[lc * 2]++;
      } else {
        s.matches++;
        dist--;
        s.dyn_ltree[(_length_code[lc] + LITERALS + 1) * 2]++;
        s.dyn_dtree[d_code(dist) * 2]++;
      }
      return s.last_lit === s.lit_bufsize - 1;
    }
    exports2._tr_init = _tr_init;
    exports2._tr_stored_block = _tr_stored_block;
    exports2._tr_flush_block = _tr_flush_block;
    exports2._tr_tally = _tr_tally;
    exports2._tr_align = _tr_align;
  }
});

// node_modules/pako/lib/zlib/adler32.js
var require_adler32 = __commonJS({
  "node_modules/pako/lib/zlib/adler32.js"(exports2, module2) {
    "use strict";
    function adler32(adler, buf, len, pos) {
      var s1 = adler & 65535 | 0, s2 = adler >>> 16 & 65535 | 0, n = 0;
      while (len !== 0) {
        n = len > 2e3 ? 2e3 : len;
        len -= n;
        do {
          s1 = s1 + buf[pos++] | 0;
          s2 = s2 + s1 | 0;
        } while (--n);
        s1 %= 65521;
        s2 %= 65521;
      }
      return s1 | s2 << 16 | 0;
    }
    module2.exports = adler32;
  }
});

// node_modules/pako/lib/zlib/crc32.js
var require_crc32 = __commonJS({
  "node_modules/pako/lib/zlib/crc32.js"(exports2, module2) {
    "use strict";
    function makeTable() {
      var c, table = [];
      for (var n = 0; n < 256; n++) {
        c = n;
        for (var k = 0; k < 8; k++) {
          c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
        }
        table[n] = c;
      }
      return table;
    }
    var crcTable = makeTable();
    function crc32(crc, buf, len, pos) {
      var t = crcTable, end = pos + len;
      crc ^= -1;
      for (var i = pos; i < end; i++) {
        crc = crc >>> 8 ^ t[(crc ^ buf[i]) & 255];
      }
      return crc ^ -1;
    }
    module2.exports = crc32;
  }
});

// node_modules/pako/lib/zlib/messages.js
var require_messages = __commonJS({
  "node_modules/pako/lib/zlib/messages.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      2: "need dictionary",
      /* Z_NEED_DICT       2  */
      1: "stream end",
      /* Z_STREAM_END      1  */
      0: "",
      /* Z_OK              0  */
      "-1": "file error",
      /* Z_ERRNO         (-1) */
      "-2": "stream error",
      /* Z_STREAM_ERROR  (-2) */
      "-3": "data error",
      /* Z_DATA_ERROR    (-3) */
      "-4": "insufficient memory",
      /* Z_MEM_ERROR     (-4) */
      "-5": "buffer error",
      /* Z_BUF_ERROR     (-5) */
      "-6": "incompatible version"
      /* Z_VERSION_ERROR (-6) */
    };
  }
});

// node_modules/pako/lib/zlib/deflate.js
var require_deflate = __commonJS({
  "node_modules/pako/lib/zlib/deflate.js"(exports2) {
    "use strict";
    var utils = require_common();
    var trees = require_trees();
    var adler32 = require_adler32();
    var crc32 = require_crc32();
    var msg = require_messages();
    var Z_NO_FLUSH = 0;
    var Z_PARTIAL_FLUSH = 1;
    var Z_FULL_FLUSH = 3;
    var Z_FINISH = 4;
    var Z_BLOCK = 5;
    var Z_OK = 0;
    var Z_STREAM_END = 1;
    var Z_STREAM_ERROR = -2;
    var Z_DATA_ERROR = -3;
    var Z_BUF_ERROR = -5;
    var Z_DEFAULT_COMPRESSION = -1;
    var Z_FILTERED = 1;
    var Z_HUFFMAN_ONLY = 2;
    var Z_RLE = 3;
    var Z_FIXED = 4;
    var Z_DEFAULT_STRATEGY = 0;
    var Z_UNKNOWN = 2;
    var Z_DEFLATED = 8;
    var MAX_MEM_LEVEL = 9;
    var MAX_WBITS = 15;
    var DEF_MEM_LEVEL = 8;
    var LENGTH_CODES = 29;
    var LITERALS = 256;
    var L_CODES = LITERALS + 1 + LENGTH_CODES;
    var D_CODES = 30;
    var BL_CODES = 19;
    var HEAP_SIZE = 2 * L_CODES + 1;
    var MAX_BITS = 15;
    var MIN_MATCH = 3;
    var MAX_MATCH = 258;
    var MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1;
    var PRESET_DICT = 32;
    var INIT_STATE = 42;
    var EXTRA_STATE = 69;
    var NAME_STATE = 73;
    var COMMENT_STATE = 91;
    var HCRC_STATE = 103;
    var BUSY_STATE = 113;
    var FINISH_STATE = 666;
    var BS_NEED_MORE = 1;
    var BS_BLOCK_DONE = 2;
    var BS_FINISH_STARTED = 3;
    var BS_FINISH_DONE = 4;
    var OS_CODE = 3;
    function err(strm, errorCode) {
      strm.msg = msg[errorCode];
      return errorCode;
    }
    function rank(f) {
      return (f << 1) - (f > 4 ? 9 : 0);
    }
    function zero(buf) {
      var len = buf.length;
      while (--len >= 0) {
        buf[len] = 0;
      }
    }
    function flush_pending(strm) {
      var s = strm.state;
      var len = s.pending;
      if (len > strm.avail_out) {
        len = strm.avail_out;
      }
      if (len === 0) {
        return;
      }
      utils.arraySet(strm.output, s.pending_buf, s.pending_out, len, strm.next_out);
      strm.next_out += len;
      s.pending_out += len;
      strm.total_out += len;
      strm.avail_out -= len;
      s.pending -= len;
      if (s.pending === 0) {
        s.pending_out = 0;
      }
    }
    function flush_block_only(s, last) {
      trees._tr_flush_block(s, s.block_start >= 0 ? s.block_start : -1, s.strstart - s.block_start, last);
      s.block_start = s.strstart;
      flush_pending(s.strm);
    }
    function put_byte(s, b) {
      s.pending_buf[s.pending++] = b;
    }
    function putShortMSB(s, b) {
      s.pending_buf[s.pending++] = b >>> 8 & 255;
      s.pending_buf[s.pending++] = b & 255;
    }
    function read_buf(strm, buf, start2, size) {
      var len = strm.avail_in;
      if (len > size) {
        len = size;
      }
      if (len === 0) {
        return 0;
      }
      strm.avail_in -= len;
      utils.arraySet(buf, strm.input, strm.next_in, len, start2);
      if (strm.state.wrap === 1) {
        strm.adler = adler32(strm.adler, buf, len, start2);
      } else if (strm.state.wrap === 2) {
        strm.adler = crc32(strm.adler, buf, len, start2);
      }
      strm.next_in += len;
      strm.total_in += len;
      return len;
    }
    function longest_match(s, cur_match) {
      var chain_length = s.max_chain_length;
      var scan = s.strstart;
      var match;
      var len;
      var best_len = s.prev_length;
      var nice_match = s.nice_match;
      var limit = s.strstart > s.w_size - MIN_LOOKAHEAD ? s.strstart - (s.w_size - MIN_LOOKAHEAD) : 0;
      var _win = s.window;
      var wmask = s.w_mask;
      var prev = s.prev;
      var strend = s.strstart + MAX_MATCH;
      var scan_end1 = _win[scan + best_len - 1];
      var scan_end = _win[scan + best_len];
      if (s.prev_length >= s.good_match) {
        chain_length >>= 2;
      }
      if (nice_match > s.lookahead) {
        nice_match = s.lookahead;
      }
      do {
        match = cur_match;
        if (_win[match + best_len] !== scan_end || _win[match + best_len - 1] !== scan_end1 || _win[match] !== _win[scan] || _win[++match] !== _win[scan + 1]) {
          continue;
        }
        scan += 2;
        match++;
        do {
        } while (_win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && scan < strend);
        len = MAX_MATCH - (strend - scan);
        scan = strend - MAX_MATCH;
        if (len > best_len) {
          s.match_start = cur_match;
          best_len = len;
          if (len >= nice_match) {
            break;
          }
          scan_end1 = _win[scan + best_len - 1];
          scan_end = _win[scan + best_len];
        }
      } while ((cur_match = prev[cur_match & wmask]) > limit && --chain_length !== 0);
      if (best_len <= s.lookahead) {
        return best_len;
      }
      return s.lookahead;
    }
    function fill_window(s) {
      var _w_size = s.w_size;
      var p, n, m, more, str;
      do {
        more = s.window_size - s.lookahead - s.strstart;
        if (s.strstart >= _w_size + (_w_size - MIN_LOOKAHEAD)) {
          utils.arraySet(s.window, s.window, _w_size, _w_size, 0);
          s.match_start -= _w_size;
          s.strstart -= _w_size;
          s.block_start -= _w_size;
          n = s.hash_size;
          p = n;
          do {
            m = s.head[--p];
            s.head[p] = m >= _w_size ? m - _w_size : 0;
          } while (--n);
          n = _w_size;
          p = n;
          do {
            m = s.prev[--p];
            s.prev[p] = m >= _w_size ? m - _w_size : 0;
          } while (--n);
          more += _w_size;
        }
        if (s.strm.avail_in === 0) {
          break;
        }
        n = read_buf(s.strm, s.window, s.strstart + s.lookahead, more);
        s.lookahead += n;
        if (s.lookahead + s.insert >= MIN_MATCH) {
          str = s.strstart - s.insert;
          s.ins_h = s.window[str];
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + 1]) & s.hash_mask;
          while (s.insert) {
            s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + MIN_MATCH - 1]) & s.hash_mask;
            s.prev[str & s.w_mask] = s.head[s.ins_h];
            s.head[s.ins_h] = str;
            str++;
            s.insert--;
            if (s.lookahead + s.insert < MIN_MATCH) {
              break;
            }
          }
        }
      } while (s.lookahead < MIN_LOOKAHEAD && s.strm.avail_in !== 0);
    }
    function deflate_stored(s, flush) {
      var max_block_size = 65535;
      if (max_block_size > s.pending_buf_size - 5) {
        max_block_size = s.pending_buf_size - 5;
      }
      for (; ; ) {
        if (s.lookahead <= 1) {
          fill_window(s);
          if (s.lookahead === 0 && flush === Z_NO_FLUSH) {
            return BS_NEED_MORE;
          }
          if (s.lookahead === 0) {
            break;
          }
        }
        s.strstart += s.lookahead;
        s.lookahead = 0;
        var max_start = s.block_start + max_block_size;
        if (s.strstart === 0 || s.strstart >= max_start) {
          s.lookahead = s.strstart - max_start;
          s.strstart = max_start;
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        }
        if (s.strstart - s.block_start >= s.w_size - MIN_LOOKAHEAD) {
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        }
      }
      s.insert = 0;
      if (flush === Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
          return BS_FINISH_STARTED;
        }
        return BS_FINISH_DONE;
      }
      if (s.strstart > s.block_start) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
      return BS_NEED_MORE;
    }
    function deflate_fast(s, flush) {
      var hash_head;
      var bflush;
      for (; ; ) {
        if (s.lookahead < MIN_LOOKAHEAD) {
          fill_window(s);
          if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH) {
            return BS_NEED_MORE;
          }
          if (s.lookahead === 0) {
            break;
          }
        }
        hash_head = 0;
        if (s.lookahead >= MIN_MATCH) {
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
          hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = s.strstart;
        }
        if (hash_head !== 0 && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
          s.match_length = longest_match(s, hash_head);
        }
        if (s.match_length >= MIN_MATCH) {
          bflush = trees._tr_tally(s, s.strstart - s.match_start, s.match_length - MIN_MATCH);
          s.lookahead -= s.match_length;
          if (s.match_length <= s.max_lazy_match && s.lookahead >= MIN_MATCH) {
            s.match_length--;
            do {
              s.strstart++;
              s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
              hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
              s.head[s.ins_h] = s.strstart;
            } while (--s.match_length !== 0);
            s.strstart++;
          } else {
            s.strstart += s.match_length;
            s.match_length = 0;
            s.ins_h = s.window[s.strstart];
            s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + 1]) & s.hash_mask;
          }
        } else {
          bflush = trees._tr_tally(s, 0, s.window[s.strstart]);
          s.lookahead--;
          s.strstart++;
        }
        if (bflush) {
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        }
      }
      s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
      if (flush === Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
          return BS_FINISH_STARTED;
        }
        return BS_FINISH_DONE;
      }
      if (s.last_lit) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
      return BS_BLOCK_DONE;
    }
    function deflate_slow(s, flush) {
      var hash_head;
      var bflush;
      var max_insert;
      for (; ; ) {
        if (s.lookahead < MIN_LOOKAHEAD) {
          fill_window(s);
          if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH) {
            return BS_NEED_MORE;
          }
          if (s.lookahead === 0) {
            break;
          }
        }
        hash_head = 0;
        if (s.lookahead >= MIN_MATCH) {
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
          hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = s.strstart;
        }
        s.prev_length = s.match_length;
        s.prev_match = s.match_start;
        s.match_length = MIN_MATCH - 1;
        if (hash_head !== 0 && s.prev_length < s.max_lazy_match && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
          s.match_length = longest_match(s, hash_head);
          if (s.match_length <= 5 && (s.strategy === Z_FILTERED || s.match_length === MIN_MATCH && s.strstart - s.match_start > 4096)) {
            s.match_length = MIN_MATCH - 1;
          }
        }
        if (s.prev_length >= MIN_MATCH && s.match_length <= s.prev_length) {
          max_insert = s.strstart + s.lookahead - MIN_MATCH;
          bflush = trees._tr_tally(s, s.strstart - 1 - s.prev_match, s.prev_length - MIN_MATCH);
          s.lookahead -= s.prev_length - 1;
          s.prev_length -= 2;
          do {
            if (++s.strstart <= max_insert) {
              s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
              hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
              s.head[s.ins_h] = s.strstart;
            }
          } while (--s.prev_length !== 0);
          s.match_available = 0;
          s.match_length = MIN_MATCH - 1;
          s.strstart++;
          if (bflush) {
            flush_block_only(s, false);
            if (s.strm.avail_out === 0) {
              return BS_NEED_MORE;
            }
          }
        } else if (s.match_available) {
          bflush = trees._tr_tally(s, 0, s.window[s.strstart - 1]);
          if (bflush) {
            flush_block_only(s, false);
          }
          s.strstart++;
          s.lookahead--;
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        } else {
          s.match_available = 1;
          s.strstart++;
          s.lookahead--;
        }
      }
      if (s.match_available) {
        bflush = trees._tr_tally(s, 0, s.window[s.strstart - 1]);
        s.match_available = 0;
      }
      s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
      if (flush === Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
          return BS_FINISH_STARTED;
        }
        return BS_FINISH_DONE;
      }
      if (s.last_lit) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
      return BS_BLOCK_DONE;
    }
    function deflate_rle(s, flush) {
      var bflush;
      var prev;
      var scan, strend;
      var _win = s.window;
      for (; ; ) {
        if (s.lookahead <= MAX_MATCH) {
          fill_window(s);
          if (s.lookahead <= MAX_MATCH && flush === Z_NO_FLUSH) {
            return BS_NEED_MORE;
          }
          if (s.lookahead === 0) {
            break;
          }
        }
        s.match_length = 0;
        if (s.lookahead >= MIN_MATCH && s.strstart > 0) {
          scan = s.strstart - 1;
          prev = _win[scan];
          if (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan]) {
            strend = s.strstart + MAX_MATCH;
            do {
            } while (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && scan < strend);
            s.match_length = MAX_MATCH - (strend - scan);
            if (s.match_length > s.lookahead) {
              s.match_length = s.lookahead;
            }
          }
        }
        if (s.match_length >= MIN_MATCH) {
          bflush = trees._tr_tally(s, 1, s.match_length - MIN_MATCH);
          s.lookahead -= s.match_length;
          s.strstart += s.match_length;
          s.match_length = 0;
        } else {
          bflush = trees._tr_tally(s, 0, s.window[s.strstart]);
          s.lookahead--;
          s.strstart++;
        }
        if (bflush) {
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        }
      }
      s.insert = 0;
      if (flush === Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
          return BS_FINISH_STARTED;
        }
        return BS_FINISH_DONE;
      }
      if (s.last_lit) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
      return BS_BLOCK_DONE;
    }
    function deflate_huff(s, flush) {
      var bflush;
      for (; ; ) {
        if (s.lookahead === 0) {
          fill_window(s);
          if (s.lookahead === 0) {
            if (flush === Z_NO_FLUSH) {
              return BS_NEED_MORE;
            }
            break;
          }
        }
        s.match_length = 0;
        bflush = trees._tr_tally(s, 0, s.window[s.strstart]);
        s.lookahead--;
        s.strstart++;
        if (bflush) {
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        }
      }
      s.insert = 0;
      if (flush === Z_FINISH) {
        flush_block_only(s, true);
        if (s.strm.avail_out === 0) {
          return BS_FINISH_STARTED;
        }
        return BS_FINISH_DONE;
      }
      if (s.last_lit) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
      return BS_BLOCK_DONE;
    }
    function Config(good_length, max_lazy, nice_length, max_chain, func) {
      this.good_length = good_length;
      this.max_lazy = max_lazy;
      this.nice_length = nice_length;
      this.max_chain = max_chain;
      this.func = func;
    }
    var configuration_table;
    configuration_table = [
      /*      good lazy nice chain */
      new Config(0, 0, 0, 0, deflate_stored),
      /* 0 store only */
      new Config(4, 4, 8, 4, deflate_fast),
      /* 1 max speed, no lazy matches */
      new Config(4, 5, 16, 8, deflate_fast),
      /* 2 */
      new Config(4, 6, 32, 32, deflate_fast),
      /* 3 */
      new Config(4, 4, 16, 16, deflate_slow),
      /* 4 lazy matches */
      new Config(8, 16, 32, 32, deflate_slow),
      /* 5 */
      new Config(8, 16, 128, 128, deflate_slow),
      /* 6 */
      new Config(8, 32, 128, 256, deflate_slow),
      /* 7 */
      new Config(32, 128, 258, 1024, deflate_slow),
      /* 8 */
      new Config(32, 258, 258, 4096, deflate_slow)
      /* 9 max compression */
    ];
    function lm_init(s) {
      s.window_size = 2 * s.w_size;
      zero(s.head);
      s.max_lazy_match = configuration_table[s.level].max_lazy;
      s.good_match = configuration_table[s.level].good_length;
      s.nice_match = configuration_table[s.level].nice_length;
      s.max_chain_length = configuration_table[s.level].max_chain;
      s.strstart = 0;
      s.block_start = 0;
      s.lookahead = 0;
      s.insert = 0;
      s.match_length = s.prev_length = MIN_MATCH - 1;
      s.match_available = 0;
      s.ins_h = 0;
    }
    function DeflateState() {
      this.strm = null;
      this.status = 0;
      this.pending_buf = null;
      this.pending_buf_size = 0;
      this.pending_out = 0;
      this.pending = 0;
      this.wrap = 0;
      this.gzhead = null;
      this.gzindex = 0;
      this.method = Z_DEFLATED;
      this.last_flush = -1;
      this.w_size = 0;
      this.w_bits = 0;
      this.w_mask = 0;
      this.window = null;
      this.window_size = 0;
      this.prev = null;
      this.head = null;
      this.ins_h = 0;
      this.hash_size = 0;
      this.hash_bits = 0;
      this.hash_mask = 0;
      this.hash_shift = 0;
      this.block_start = 0;
      this.match_length = 0;
      this.prev_match = 0;
      this.match_available = 0;
      this.strstart = 0;
      this.match_start = 0;
      this.lookahead = 0;
      this.prev_length = 0;
      this.max_chain_length = 0;
      this.max_lazy_match = 0;
      this.level = 0;
      this.strategy = 0;
      this.good_match = 0;
      this.nice_match = 0;
      this.dyn_ltree = new utils.Buf16(HEAP_SIZE * 2);
      this.dyn_dtree = new utils.Buf16((2 * D_CODES + 1) * 2);
      this.bl_tree = new utils.Buf16((2 * BL_CODES + 1) * 2);
      zero(this.dyn_ltree);
      zero(this.dyn_dtree);
      zero(this.bl_tree);
      this.l_desc = null;
      this.d_desc = null;
      this.bl_desc = null;
      this.bl_count = new utils.Buf16(MAX_BITS + 1);
      this.heap = new utils.Buf16(2 * L_CODES + 1);
      zero(this.heap);
      this.heap_len = 0;
      this.heap_max = 0;
      this.depth = new utils.Buf16(2 * L_CODES + 1);
      zero(this.depth);
      this.l_buf = 0;
      this.lit_bufsize = 0;
      this.last_lit = 0;
      this.d_buf = 0;
      this.opt_len = 0;
      this.static_len = 0;
      this.matches = 0;
      this.insert = 0;
      this.bi_buf = 0;
      this.bi_valid = 0;
    }
    function deflateResetKeep(strm) {
      var s;
      if (!strm || !strm.state) {
        return err(strm, Z_STREAM_ERROR);
      }
      strm.total_in = strm.total_out = 0;
      strm.data_type = Z_UNKNOWN;
      s = strm.state;
      s.pending = 0;
      s.pending_out = 0;
      if (s.wrap < 0) {
        s.wrap = -s.wrap;
      }
      s.status = s.wrap ? INIT_STATE : BUSY_STATE;
      strm.adler = s.wrap === 2 ? 0 : 1;
      s.last_flush = Z_NO_FLUSH;
      trees._tr_init(s);
      return Z_OK;
    }
    function deflateReset(strm) {
      var ret = deflateResetKeep(strm);
      if (ret === Z_OK) {
        lm_init(strm.state);
      }
      return ret;
    }
    function deflateSetHeader(strm, head) {
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      if (strm.state.wrap !== 2) {
        return Z_STREAM_ERROR;
      }
      strm.state.gzhead = head;
      return Z_OK;
    }
    function deflateInit2(strm, level, method, windowBits, memLevel, strategy) {
      if (!strm) {
        return Z_STREAM_ERROR;
      }
      var wrap = 1;
      if (level === Z_DEFAULT_COMPRESSION) {
        level = 6;
      }
      if (windowBits < 0) {
        wrap = 0;
        windowBits = -windowBits;
      } else if (windowBits > 15) {
        wrap = 2;
        windowBits -= 16;
      }
      if (memLevel < 1 || memLevel > MAX_MEM_LEVEL || method !== Z_DEFLATED || windowBits < 8 || windowBits > 15 || level < 0 || level > 9 || strategy < 0 || strategy > Z_FIXED) {
        return err(strm, Z_STREAM_ERROR);
      }
      if (windowBits === 8) {
        windowBits = 9;
      }
      var s = new DeflateState();
      strm.state = s;
      s.strm = strm;
      s.wrap = wrap;
      s.gzhead = null;
      s.w_bits = windowBits;
      s.w_size = 1 << s.w_bits;
      s.w_mask = s.w_size - 1;
      s.hash_bits = memLevel + 7;
      s.hash_size = 1 << s.hash_bits;
      s.hash_mask = s.hash_size - 1;
      s.hash_shift = ~~((s.hash_bits + MIN_MATCH - 1) / MIN_MATCH);
      s.window = new utils.Buf8(s.w_size * 2);
      s.head = new utils.Buf16(s.hash_size);
      s.prev = new utils.Buf16(s.w_size);
      s.lit_bufsize = 1 << memLevel + 6;
      s.pending_buf_size = s.lit_bufsize * 4;
      s.pending_buf = new utils.Buf8(s.pending_buf_size);
      s.d_buf = 1 * s.lit_bufsize;
      s.l_buf = (1 + 2) * s.lit_bufsize;
      s.level = level;
      s.strategy = strategy;
      s.method = method;
      return deflateReset(strm);
    }
    function deflateInit(strm, level) {
      return deflateInit2(strm, level, Z_DEFLATED, MAX_WBITS, DEF_MEM_LEVEL, Z_DEFAULT_STRATEGY);
    }
    function deflate(strm, flush) {
      var old_flush, s;
      var beg, val;
      if (!strm || !strm.state || flush > Z_BLOCK || flush < 0) {
        return strm ? err(strm, Z_STREAM_ERROR) : Z_STREAM_ERROR;
      }
      s = strm.state;
      if (!strm.output || !strm.input && strm.avail_in !== 0 || s.status === FINISH_STATE && flush !== Z_FINISH) {
        return err(strm, strm.avail_out === 0 ? Z_BUF_ERROR : Z_STREAM_ERROR);
      }
      s.strm = strm;
      old_flush = s.last_flush;
      s.last_flush = flush;
      if (s.status === INIT_STATE) {
        if (s.wrap === 2) {
          strm.adler = 0;
          put_byte(s, 31);
          put_byte(s, 139);
          put_byte(s, 8);
          if (!s.gzhead) {
            put_byte(s, 0);
            put_byte(s, 0);
            put_byte(s, 0);
            put_byte(s, 0);
            put_byte(s, 0);
            put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ? 4 : 0);
            put_byte(s, OS_CODE);
            s.status = BUSY_STATE;
          } else {
            put_byte(
              s,
              (s.gzhead.text ? 1 : 0) + (s.gzhead.hcrc ? 2 : 0) + (!s.gzhead.extra ? 0 : 4) + (!s.gzhead.name ? 0 : 8) + (!s.gzhead.comment ? 0 : 16)
            );
            put_byte(s, s.gzhead.time & 255);
            put_byte(s, s.gzhead.time >> 8 & 255);
            put_byte(s, s.gzhead.time >> 16 & 255);
            put_byte(s, s.gzhead.time >> 24 & 255);
            put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ? 4 : 0);
            put_byte(s, s.gzhead.os & 255);
            if (s.gzhead.extra && s.gzhead.extra.length) {
              put_byte(s, s.gzhead.extra.length & 255);
              put_byte(s, s.gzhead.extra.length >> 8 & 255);
            }
            if (s.gzhead.hcrc) {
              strm.adler = crc32(strm.adler, s.pending_buf, s.pending, 0);
            }
            s.gzindex = 0;
            s.status = EXTRA_STATE;
          }
        } else {
          var header = Z_DEFLATED + (s.w_bits - 8 << 4) << 8;
          var level_flags = -1;
          if (s.strategy >= Z_HUFFMAN_ONLY || s.level < 2) {
            level_flags = 0;
          } else if (s.level < 6) {
            level_flags = 1;
          } else if (s.level === 6) {
            level_flags = 2;
          } else {
            level_flags = 3;
          }
          header |= level_flags << 6;
          if (s.strstart !== 0) {
            header |= PRESET_DICT;
          }
          header += 31 - header % 31;
          s.status = BUSY_STATE;
          putShortMSB(s, header);
          if (s.strstart !== 0) {
            putShortMSB(s, strm.adler >>> 16);
            putShortMSB(s, strm.adler & 65535);
          }
          strm.adler = 1;
        }
      }
      if (s.status === EXTRA_STATE) {
        if (s.gzhead.extra) {
          beg = s.pending;
          while (s.gzindex < (s.gzhead.extra.length & 65535)) {
            if (s.pending === s.pending_buf_size) {
              if (s.gzhead.hcrc && s.pending > beg) {
                strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
              }
              flush_pending(strm);
              beg = s.pending;
              if (s.pending === s.pending_buf_size) {
                break;
              }
            }
            put_byte(s, s.gzhead.extra[s.gzindex] & 255);
            s.gzindex++;
          }
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          if (s.gzindex === s.gzhead.extra.length) {
            s.gzindex = 0;
            s.status = NAME_STATE;
          }
        } else {
          s.status = NAME_STATE;
        }
      }
      if (s.status === NAME_STATE) {
        if (s.gzhead.name) {
          beg = s.pending;
          do {
            if (s.pending === s.pending_buf_size) {
              if (s.gzhead.hcrc && s.pending > beg) {
                strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
              }
              flush_pending(strm);
              beg = s.pending;
              if (s.pending === s.pending_buf_size) {
                val = 1;
                break;
              }
            }
            if (s.gzindex < s.gzhead.name.length) {
              val = s.gzhead.name.charCodeAt(s.gzindex++) & 255;
            } else {
              val = 0;
            }
            put_byte(s, val);
          } while (val !== 0);
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          if (val === 0) {
            s.gzindex = 0;
            s.status = COMMENT_STATE;
          }
        } else {
          s.status = COMMENT_STATE;
        }
      }
      if (s.status === COMMENT_STATE) {
        if (s.gzhead.comment) {
          beg = s.pending;
          do {
            if (s.pending === s.pending_buf_size) {
              if (s.gzhead.hcrc && s.pending > beg) {
                strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
              }
              flush_pending(strm);
              beg = s.pending;
              if (s.pending === s.pending_buf_size) {
                val = 1;
                break;
              }
            }
            if (s.gzindex < s.gzhead.comment.length) {
              val = s.gzhead.comment.charCodeAt(s.gzindex++) & 255;
            } else {
              val = 0;
            }
            put_byte(s, val);
          } while (val !== 0);
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          if (val === 0) {
            s.status = HCRC_STATE;
          }
        } else {
          s.status = HCRC_STATE;
        }
      }
      if (s.status === HCRC_STATE) {
        if (s.gzhead.hcrc) {
          if (s.pending + 2 > s.pending_buf_size) {
            flush_pending(strm);
          }
          if (s.pending + 2 <= s.pending_buf_size) {
            put_byte(s, strm.adler & 255);
            put_byte(s, strm.adler >> 8 & 255);
            strm.adler = 0;
            s.status = BUSY_STATE;
          }
        } else {
          s.status = BUSY_STATE;
        }
      }
      if (s.pending !== 0) {
        flush_pending(strm);
        if (strm.avail_out === 0) {
          s.last_flush = -1;
          return Z_OK;
        }
      } else if (strm.avail_in === 0 && rank(flush) <= rank(old_flush) && flush !== Z_FINISH) {
        return err(strm, Z_BUF_ERROR);
      }
      if (s.status === FINISH_STATE && strm.avail_in !== 0) {
        return err(strm, Z_BUF_ERROR);
      }
      if (strm.avail_in !== 0 || s.lookahead !== 0 || flush !== Z_NO_FLUSH && s.status !== FINISH_STATE) {
        var bstate = s.strategy === Z_HUFFMAN_ONLY ? deflate_huff(s, flush) : s.strategy === Z_RLE ? deflate_rle(s, flush) : configuration_table[s.level].func(s, flush);
        if (bstate === BS_FINISH_STARTED || bstate === BS_FINISH_DONE) {
          s.status = FINISH_STATE;
        }
        if (bstate === BS_NEED_MORE || bstate === BS_FINISH_STARTED) {
          if (strm.avail_out === 0) {
            s.last_flush = -1;
          }
          return Z_OK;
        }
        if (bstate === BS_BLOCK_DONE) {
          if (flush === Z_PARTIAL_FLUSH) {
            trees._tr_align(s);
          } else if (flush !== Z_BLOCK) {
            trees._tr_stored_block(s, 0, 0, false);
            if (flush === Z_FULL_FLUSH) {
              zero(s.head);
              if (s.lookahead === 0) {
                s.strstart = 0;
                s.block_start = 0;
                s.insert = 0;
              }
            }
          }
          flush_pending(strm);
          if (strm.avail_out === 0) {
            s.last_flush = -1;
            return Z_OK;
          }
        }
      }
      if (flush !== Z_FINISH) {
        return Z_OK;
      }
      if (s.wrap <= 0) {
        return Z_STREAM_END;
      }
      if (s.wrap === 2) {
        put_byte(s, strm.adler & 255);
        put_byte(s, strm.adler >> 8 & 255);
        put_byte(s, strm.adler >> 16 & 255);
        put_byte(s, strm.adler >> 24 & 255);
        put_byte(s, strm.total_in & 255);
        put_byte(s, strm.total_in >> 8 & 255);
        put_byte(s, strm.total_in >> 16 & 255);
        put_byte(s, strm.total_in >> 24 & 255);
      } else {
        putShortMSB(s, strm.adler >>> 16);
        putShortMSB(s, strm.adler & 65535);
      }
      flush_pending(strm);
      if (s.wrap > 0) {
        s.wrap = -s.wrap;
      }
      return s.pending !== 0 ? Z_OK : Z_STREAM_END;
    }
    function deflateEnd(strm) {
      var status;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      status = strm.state.status;
      if (status !== INIT_STATE && status !== EXTRA_STATE && status !== NAME_STATE && status !== COMMENT_STATE && status !== HCRC_STATE && status !== BUSY_STATE && status !== FINISH_STATE) {
        return err(strm, Z_STREAM_ERROR);
      }
      strm.state = null;
      return status === BUSY_STATE ? err(strm, Z_DATA_ERROR) : Z_OK;
    }
    function deflateSetDictionary(strm, dictionary) {
      var dictLength = dictionary.length;
      var s;
      var str, n;
      var wrap;
      var avail;
      var next;
      var input;
      var tmpDict;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      s = strm.state;
      wrap = s.wrap;
      if (wrap === 2 || wrap === 1 && s.status !== INIT_STATE || s.lookahead) {
        return Z_STREAM_ERROR;
      }
      if (wrap === 1) {
        strm.adler = adler32(strm.adler, dictionary, dictLength, 0);
      }
      s.wrap = 0;
      if (dictLength >= s.w_size) {
        if (wrap === 0) {
          zero(s.head);
          s.strstart = 0;
          s.block_start = 0;
          s.insert = 0;
        }
        tmpDict = new utils.Buf8(s.w_size);
        utils.arraySet(tmpDict, dictionary, dictLength - s.w_size, s.w_size, 0);
        dictionary = tmpDict;
        dictLength = s.w_size;
      }
      avail = strm.avail_in;
      next = strm.next_in;
      input = strm.input;
      strm.avail_in = dictLength;
      strm.next_in = 0;
      strm.input = dictionary;
      fill_window(s);
      while (s.lookahead >= MIN_MATCH) {
        str = s.strstart;
        n = s.lookahead - (MIN_MATCH - 1);
        do {
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + MIN_MATCH - 1]) & s.hash_mask;
          s.prev[str & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = str;
          str++;
        } while (--n);
        s.strstart = str;
        s.lookahead = MIN_MATCH - 1;
        fill_window(s);
      }
      s.strstart += s.lookahead;
      s.block_start = s.strstart;
      s.insert = s.lookahead;
      s.lookahead = 0;
      s.match_length = s.prev_length = MIN_MATCH - 1;
      s.match_available = 0;
      strm.next_in = next;
      strm.input = input;
      strm.avail_in = avail;
      s.wrap = wrap;
      return Z_OK;
    }
    exports2.deflateInit = deflateInit;
    exports2.deflateInit2 = deflateInit2;
    exports2.deflateReset = deflateReset;
    exports2.deflateResetKeep = deflateResetKeep;
    exports2.deflateSetHeader = deflateSetHeader;
    exports2.deflate = deflate;
    exports2.deflateEnd = deflateEnd;
    exports2.deflateSetDictionary = deflateSetDictionary;
    exports2.deflateInfo = "pako deflate (from Nodeca project)";
  }
});

// node_modules/pako/lib/utils/strings.js
var require_strings = __commonJS({
  "node_modules/pako/lib/utils/strings.js"(exports2) {
    "use strict";
    var utils = require_common();
    var STR_APPLY_OK = true;
    var STR_APPLY_UIA_OK = true;
    try {
      String.fromCharCode.apply(null, [0]);
    } catch (__) {
      STR_APPLY_OK = false;
    }
    try {
      String.fromCharCode.apply(null, new Uint8Array(1));
    } catch (__) {
      STR_APPLY_UIA_OK = false;
    }
    var _utf8len = new utils.Buf8(256);
    for (q = 0; q < 256; q++) {
      _utf8len[q] = q >= 252 ? 6 : q >= 248 ? 5 : q >= 240 ? 4 : q >= 224 ? 3 : q >= 192 ? 2 : 1;
    }
    var q;
    _utf8len[254] = _utf8len[254] = 1;
    exports2.string2buf = function(str) {
      var buf, c, c2, m_pos, i, str_len = str.length, buf_len = 0;
      for (m_pos = 0; m_pos < str_len; m_pos++) {
        c = str.charCodeAt(m_pos);
        if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
          c2 = str.charCodeAt(m_pos + 1);
          if ((c2 & 64512) === 56320) {
            c = 65536 + (c - 55296 << 10) + (c2 - 56320);
            m_pos++;
          }
        }
        buf_len += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
      }
      buf = new utils.Buf8(buf_len);
      for (i = 0, m_pos = 0; i < buf_len; m_pos++) {
        c = str.charCodeAt(m_pos);
        if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
          c2 = str.charCodeAt(m_pos + 1);
          if ((c2 & 64512) === 56320) {
            c = 65536 + (c - 55296 << 10) + (c2 - 56320);
            m_pos++;
          }
        }
        if (c < 128) {
          buf[i++] = c;
        } else if (c < 2048) {
          buf[i++] = 192 | c >>> 6;
          buf[i++] = 128 | c & 63;
        } else if (c < 65536) {
          buf[i++] = 224 | c >>> 12;
          buf[i++] = 128 | c >>> 6 & 63;
          buf[i++] = 128 | c & 63;
        } else {
          buf[i++] = 240 | c >>> 18;
          buf[i++] = 128 | c >>> 12 & 63;
          buf[i++] = 128 | c >>> 6 & 63;
          buf[i++] = 128 | c & 63;
        }
      }
      return buf;
    };
    function buf2binstring(buf, len) {
      if (len < 65534) {
        if (buf.subarray && STR_APPLY_UIA_OK || !buf.subarray && STR_APPLY_OK) {
          return String.fromCharCode.apply(null, utils.shrinkBuf(buf, len));
        }
      }
      var result = "";
      for (var i = 0; i < len; i++) {
        result += String.fromCharCode(buf[i]);
      }
      return result;
    }
    exports2.buf2binstring = function(buf) {
      return buf2binstring(buf, buf.length);
    };
    exports2.binstring2buf = function(str) {
      var buf = new utils.Buf8(str.length);
      for (var i = 0, len = buf.length; i < len; i++) {
        buf[i] = str.charCodeAt(i);
      }
      return buf;
    };
    exports2.buf2string = function(buf, max2) {
      var i, out, c, c_len;
      var len = max2 || buf.length;
      var utf16buf = new Array(len * 2);
      for (out = 0, i = 0; i < len; ) {
        c = buf[i++];
        if (c < 128) {
          utf16buf[out++] = c;
          continue;
        }
        c_len = _utf8len[c];
        if (c_len > 4) {
          utf16buf[out++] = 65533;
          i += c_len - 1;
          continue;
        }
        c &= c_len === 2 ? 31 : c_len === 3 ? 15 : 7;
        while (c_len > 1 && i < len) {
          c = c << 6 | buf[i++] & 63;
          c_len--;
        }
        if (c_len > 1) {
          utf16buf[out++] = 65533;
          continue;
        }
        if (c < 65536) {
          utf16buf[out++] = c;
        } else {
          c -= 65536;
          utf16buf[out++] = 55296 | c >> 10 & 1023;
          utf16buf[out++] = 56320 | c & 1023;
        }
      }
      return buf2binstring(utf16buf, out);
    };
    exports2.utf8border = function(buf, max2) {
      var pos;
      max2 = max2 || buf.length;
      if (max2 > buf.length) {
        max2 = buf.length;
      }
      pos = max2 - 1;
      while (pos >= 0 && (buf[pos] & 192) === 128) {
        pos--;
      }
      if (pos < 0) {
        return max2;
      }
      if (pos === 0) {
        return max2;
      }
      return pos + _utf8len[buf[pos]] > max2 ? pos : max2;
    };
  }
});

// node_modules/pako/lib/zlib/zstream.js
var require_zstream = __commonJS({
  "node_modules/pako/lib/zlib/zstream.js"(exports2, module2) {
    "use strict";
    function ZStream() {
      this.input = null;
      this.next_in = 0;
      this.avail_in = 0;
      this.total_in = 0;
      this.output = null;
      this.next_out = 0;
      this.avail_out = 0;
      this.total_out = 0;
      this.msg = "";
      this.state = null;
      this.data_type = 2;
      this.adler = 0;
    }
    module2.exports = ZStream;
  }
});

// node_modules/pako/lib/deflate.js
var require_deflate2 = __commonJS({
  "node_modules/pako/lib/deflate.js"(exports2) {
    "use strict";
    var zlib_deflate = require_deflate();
    var utils = require_common();
    var strings = require_strings();
    var msg = require_messages();
    var ZStream = require_zstream();
    var toString = Object.prototype.toString;
    var Z_NO_FLUSH = 0;
    var Z_FINISH = 4;
    var Z_OK = 0;
    var Z_STREAM_END = 1;
    var Z_SYNC_FLUSH = 2;
    var Z_DEFAULT_COMPRESSION = -1;
    var Z_DEFAULT_STRATEGY = 0;
    var Z_DEFLATED = 8;
    function Deflate(options) {
      if (!(this instanceof Deflate)) return new Deflate(options);
      this.options = utils.assign({
        level: Z_DEFAULT_COMPRESSION,
        method: Z_DEFLATED,
        chunkSize: 16384,
        windowBits: 15,
        memLevel: 8,
        strategy: Z_DEFAULT_STRATEGY,
        to: ""
      }, options || {});
      var opt = this.options;
      if (opt.raw && opt.windowBits > 0) {
        opt.windowBits = -opt.windowBits;
      } else if (opt.gzip && opt.windowBits > 0 && opt.windowBits < 16) {
        opt.windowBits += 16;
      }
      this.err = 0;
      this.msg = "";
      this.ended = false;
      this.chunks = [];
      this.strm = new ZStream();
      this.strm.avail_out = 0;
      var status = zlib_deflate.deflateInit2(
        this.strm,
        opt.level,
        opt.method,
        opt.windowBits,
        opt.memLevel,
        opt.strategy
      );
      if (status !== Z_OK) {
        throw new Error(msg[status]);
      }
      if (opt.header) {
        zlib_deflate.deflateSetHeader(this.strm, opt.header);
      }
      if (opt.dictionary) {
        var dict;
        if (typeof opt.dictionary === "string") {
          dict = strings.string2buf(opt.dictionary);
        } else if (toString.call(opt.dictionary) === "[object ArrayBuffer]") {
          dict = new Uint8Array(opt.dictionary);
        } else {
          dict = opt.dictionary;
        }
        status = zlib_deflate.deflateSetDictionary(this.strm, dict);
        if (status !== Z_OK) {
          throw new Error(msg[status]);
        }
        this._dict_set = true;
      }
    }
    Deflate.prototype.push = function(data, mode) {
      var strm = this.strm;
      var chunkSize = this.options.chunkSize;
      var status, _mode;
      if (this.ended) {
        return false;
      }
      _mode = mode === ~~mode ? mode : mode === true ? Z_FINISH : Z_NO_FLUSH;
      if (typeof data === "string") {
        strm.input = strings.string2buf(data);
      } else if (toString.call(data) === "[object ArrayBuffer]") {
        strm.input = new Uint8Array(data);
      } else {
        strm.input = data;
      }
      strm.next_in = 0;
      strm.avail_in = strm.input.length;
      do {
        if (strm.avail_out === 0) {
          strm.output = new utils.Buf8(chunkSize);
          strm.next_out = 0;
          strm.avail_out = chunkSize;
        }
        status = zlib_deflate.deflate(strm, _mode);
        if (status !== Z_STREAM_END && status !== Z_OK) {
          this.onEnd(status);
          this.ended = true;
          return false;
        }
        if (strm.avail_out === 0 || strm.avail_in === 0 && (_mode === Z_FINISH || _mode === Z_SYNC_FLUSH)) {
          if (this.options.to === "string") {
            this.onData(strings.buf2binstring(utils.shrinkBuf(strm.output, strm.next_out)));
          } else {
            this.onData(utils.shrinkBuf(strm.output, strm.next_out));
          }
        }
      } while ((strm.avail_in > 0 || strm.avail_out === 0) && status !== Z_STREAM_END);
      if (_mode === Z_FINISH) {
        status = zlib_deflate.deflateEnd(this.strm);
        this.onEnd(status);
        this.ended = true;
        return status === Z_OK;
      }
      if (_mode === Z_SYNC_FLUSH) {
        this.onEnd(Z_OK);
        strm.avail_out = 0;
        return true;
      }
      return true;
    };
    Deflate.prototype.onData = function(chunk) {
      this.chunks.push(chunk);
    };
    Deflate.prototype.onEnd = function(status) {
      if (status === Z_OK) {
        if (this.options.to === "string") {
          this.result = this.chunks.join("");
        } else {
          this.result = utils.flattenChunks(this.chunks);
        }
      }
      this.chunks = [];
      this.err = status;
      this.msg = this.strm.msg;
    };
    function deflate(input, options) {
      var deflator = new Deflate(options);
      deflator.push(input, true);
      if (deflator.err) {
        throw deflator.msg || msg[deflator.err];
      }
      return deflator.result;
    }
    function deflateRaw(input, options) {
      options = options || {};
      options.raw = true;
      return deflate(input, options);
    }
    function gzip(input, options) {
      options = options || {};
      options.gzip = true;
      return deflate(input, options);
    }
    exports2.Deflate = Deflate;
    exports2.deflate = deflate;
    exports2.deflateRaw = deflateRaw;
    exports2.gzip = gzip;
  }
});

// node_modules/pako/lib/zlib/inffast.js
var require_inffast = __commonJS({
  "node_modules/pako/lib/zlib/inffast.js"(exports2, module2) {
    "use strict";
    var BAD = 30;
    var TYPE = 12;
    module2.exports = function inflate_fast(strm, start2) {
      var state;
      var _in;
      var last;
      var _out;
      var beg;
      var end;
      var dmax;
      var wsize;
      var whave;
      var wnext;
      var s_window;
      var hold;
      var bits;
      var lcode;
      var dcode;
      var lmask;
      var dmask;
      var here;
      var op;
      var len;
      var dist;
      var from;
      var from_source;
      var input, output;
      state = strm.state;
      _in = strm.next_in;
      input = strm.input;
      last = _in + (strm.avail_in - 5);
      _out = strm.next_out;
      output = strm.output;
      beg = _out - (start2 - strm.avail_out);
      end = _out + (strm.avail_out - 257);
      dmax = state.dmax;
      wsize = state.wsize;
      whave = state.whave;
      wnext = state.wnext;
      s_window = state.window;
      hold = state.hold;
      bits = state.bits;
      lcode = state.lencode;
      dcode = state.distcode;
      lmask = (1 << state.lenbits) - 1;
      dmask = (1 << state.distbits) - 1;
      top:
        do {
          if (bits < 15) {
            hold += input[_in++] << bits;
            bits += 8;
            hold += input[_in++] << bits;
            bits += 8;
          }
          here = lcode[hold & lmask];
          dolen:
            for (; ; ) {
              op = here >>> 24;
              hold >>>= op;
              bits -= op;
              op = here >>> 16 & 255;
              if (op === 0) {
                output[_out++] = here & 65535;
              } else if (op & 16) {
                len = here & 65535;
                op &= 15;
                if (op) {
                  if (bits < op) {
                    hold += input[_in++] << bits;
                    bits += 8;
                  }
                  len += hold & (1 << op) - 1;
                  hold >>>= op;
                  bits -= op;
                }
                if (bits < 15) {
                  hold += input[_in++] << bits;
                  bits += 8;
                  hold += input[_in++] << bits;
                  bits += 8;
                }
                here = dcode[hold & dmask];
                dodist:
                  for (; ; ) {
                    op = here >>> 24;
                    hold >>>= op;
                    bits -= op;
                    op = here >>> 16 & 255;
                    if (op & 16) {
                      dist = here & 65535;
                      op &= 15;
                      if (bits < op) {
                        hold += input[_in++] << bits;
                        bits += 8;
                        if (bits < op) {
                          hold += input[_in++] << bits;
                          bits += 8;
                        }
                      }
                      dist += hold & (1 << op) - 1;
                      if (dist > dmax) {
                        strm.msg = "invalid distance too far back";
                        state.mode = BAD;
                        break top;
                      }
                      hold >>>= op;
                      bits -= op;
                      op = _out - beg;
                      if (dist > op) {
                        op = dist - op;
                        if (op > whave) {
                          if (state.sane) {
                            strm.msg = "invalid distance too far back";
                            state.mode = BAD;
                            break top;
                          }
                        }
                        from = 0;
                        from_source = s_window;
                        if (wnext === 0) {
                          from += wsize - op;
                          if (op < len) {
                            len -= op;
                            do {
                              output[_out++] = s_window[from++];
                            } while (--op);
                            from = _out - dist;
                            from_source = output;
                          }
                        } else if (wnext < op) {
                          from += wsize + wnext - op;
                          op -= wnext;
                          if (op < len) {
                            len -= op;
                            do {
                              output[_out++] = s_window[from++];
                            } while (--op);
                            from = 0;
                            if (wnext < len) {
                              op = wnext;
                              len -= op;
                              do {
                                output[_out++] = s_window[from++];
                              } while (--op);
                              from = _out - dist;
                              from_source = output;
                            }
                          }
                        } else {
                          from += wnext - op;
                          if (op < len) {
                            len -= op;
                            do {
                              output[_out++] = s_window[from++];
                            } while (--op);
                            from = _out - dist;
                            from_source = output;
                          }
                        }
                        while (len > 2) {
                          output[_out++] = from_source[from++];
                          output[_out++] = from_source[from++];
                          output[_out++] = from_source[from++];
                          len -= 3;
                        }
                        if (len) {
                          output[_out++] = from_source[from++];
                          if (len > 1) {
                            output[_out++] = from_source[from++];
                          }
                        }
                      } else {
                        from = _out - dist;
                        do {
                          output[_out++] = output[from++];
                          output[_out++] = output[from++];
                          output[_out++] = output[from++];
                          len -= 3;
                        } while (len > 2);
                        if (len) {
                          output[_out++] = output[from++];
                          if (len > 1) {
                            output[_out++] = output[from++];
                          }
                        }
                      }
                    } else if ((op & 64) === 0) {
                      here = dcode[(here & 65535) + (hold & (1 << op) - 1)];
                      continue dodist;
                    } else {
                      strm.msg = "invalid distance code";
                      state.mode = BAD;
                      break top;
                    }
                    break;
                  }
              } else if ((op & 64) === 0) {
                here = lcode[(here & 65535) + (hold & (1 << op) - 1)];
                continue dolen;
              } else if (op & 32) {
                state.mode = TYPE;
                break top;
              } else {
                strm.msg = "invalid literal/length code";
                state.mode = BAD;
                break top;
              }
              break;
            }
        } while (_in < last && _out < end);
      len = bits >> 3;
      _in -= len;
      bits -= len << 3;
      hold &= (1 << bits) - 1;
      strm.next_in = _in;
      strm.next_out = _out;
      strm.avail_in = _in < last ? 5 + (last - _in) : 5 - (_in - last);
      strm.avail_out = _out < end ? 257 + (end - _out) : 257 - (_out - end);
      state.hold = hold;
      state.bits = bits;
      return;
    };
  }
});

// node_modules/pako/lib/zlib/inftrees.js
var require_inftrees = __commonJS({
  "node_modules/pako/lib/zlib/inftrees.js"(exports2, module2) {
    "use strict";
    var utils = require_common();
    var MAXBITS = 15;
    var ENOUGH_LENS = 852;
    var ENOUGH_DISTS = 592;
    var CODES = 0;
    var LENS = 1;
    var DISTS = 2;
    var lbase = [
      /* Length codes 257..285 base */
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      13,
      15,
      17,
      19,
      23,
      27,
      31,
      35,
      43,
      51,
      59,
      67,
      83,
      99,
      115,
      131,
      163,
      195,
      227,
      258,
      0,
      0
    ];
    var lext = [
      /* Length codes 257..285 extra */
      16,
      16,
      16,
      16,
      16,
      16,
      16,
      16,
      17,
      17,
      17,
      17,
      18,
      18,
      18,
      18,
      19,
      19,
      19,
      19,
      20,
      20,
      20,
      20,
      21,
      21,
      21,
      21,
      16,
      72,
      78
    ];
    var dbase = [
      /* Distance codes 0..29 base */
      1,
      2,
      3,
      4,
      5,
      7,
      9,
      13,
      17,
      25,
      33,
      49,
      65,
      97,
      129,
      193,
      257,
      385,
      513,
      769,
      1025,
      1537,
      2049,
      3073,
      4097,
      6145,
      8193,
      12289,
      16385,
      24577,
      0,
      0
    ];
    var dext = [
      /* Distance codes 0..29 extra */
      16,
      16,
      16,
      16,
      17,
      17,
      18,
      18,
      19,
      19,
      20,
      20,
      21,
      21,
      22,
      22,
      23,
      23,
      24,
      24,
      25,
      25,
      26,
      26,
      27,
      27,
      28,
      28,
      29,
      29,
      64,
      64
    ];
    module2.exports = function inflate_table(type, lens, lens_index, codes, table, table_index, work, opts) {
      var bits = opts.bits;
      var len = 0;
      var sym = 0;
      var min = 0, max2 = 0;
      var root = 0;
      var curr = 0;
      var drop = 0;
      var left = 0;
      var used = 0;
      var huff = 0;
      var incr;
      var fill;
      var low;
      var mask;
      var next;
      var base = null;
      var base_index = 0;
      var end;
      var count = new utils.Buf16(MAXBITS + 1);
      var offs = new utils.Buf16(MAXBITS + 1);
      var extra = null;
      var extra_index = 0;
      var here_bits, here_op, here_val;
      for (len = 0; len <= MAXBITS; len++) {
        count[len] = 0;
      }
      for (sym = 0; sym < codes; sym++) {
        count[lens[lens_index + sym]]++;
      }
      root = bits;
      for (max2 = MAXBITS; max2 >= 1; max2--) {
        if (count[max2] !== 0) {
          break;
        }
      }
      if (root > max2) {
        root = max2;
      }
      if (max2 === 0) {
        table[table_index++] = 1 << 24 | 64 << 16 | 0;
        table[table_index++] = 1 << 24 | 64 << 16 | 0;
        opts.bits = 1;
        return 0;
      }
      for (min = 1; min < max2; min++) {
        if (count[min] !== 0) {
          break;
        }
      }
      if (root < min) {
        root = min;
      }
      left = 1;
      for (len = 1; len <= MAXBITS; len++) {
        left <<= 1;
        left -= count[len];
        if (left < 0) {
          return -1;
        }
      }
      if (left > 0 && (type === CODES || max2 !== 1)) {
        return -1;
      }
      offs[1] = 0;
      for (len = 1; len < MAXBITS; len++) {
        offs[len + 1] = offs[len] + count[len];
      }
      for (sym = 0; sym < codes; sym++) {
        if (lens[lens_index + sym] !== 0) {
          work[offs[lens[lens_index + sym]]++] = sym;
        }
      }
      if (type === CODES) {
        base = extra = work;
        end = 19;
      } else if (type === LENS) {
        base = lbase;
        base_index -= 257;
        extra = lext;
        extra_index -= 257;
        end = 256;
      } else {
        base = dbase;
        extra = dext;
        end = -1;
      }
      huff = 0;
      sym = 0;
      len = min;
      next = table_index;
      curr = root;
      drop = 0;
      low = -1;
      used = 1 << root;
      mask = used - 1;
      if (type === LENS && used > ENOUGH_LENS || type === DISTS && used > ENOUGH_DISTS) {
        return 1;
      }
      for (; ; ) {
        here_bits = len - drop;
        if (work[sym] < end) {
          here_op = 0;
          here_val = work[sym];
        } else if (work[sym] > end) {
          here_op = extra[extra_index + work[sym]];
          here_val = base[base_index + work[sym]];
        } else {
          here_op = 32 + 64;
          here_val = 0;
        }
        incr = 1 << len - drop;
        fill = 1 << curr;
        min = fill;
        do {
          fill -= incr;
          table[next + (huff >> drop) + fill] = here_bits << 24 | here_op << 16 | here_val | 0;
        } while (fill !== 0);
        incr = 1 << len - 1;
        while (huff & incr) {
          incr >>= 1;
        }
        if (incr !== 0) {
          huff &= incr - 1;
          huff += incr;
        } else {
          huff = 0;
        }
        sym++;
        if (--count[len] === 0) {
          if (len === max2) {
            break;
          }
          len = lens[lens_index + work[sym]];
        }
        if (len > root && (huff & mask) !== low) {
          if (drop === 0) {
            drop = root;
          }
          next += min;
          curr = len - drop;
          left = 1 << curr;
          while (curr + drop < max2) {
            left -= count[curr + drop];
            if (left <= 0) {
              break;
            }
            curr++;
            left <<= 1;
          }
          used += 1 << curr;
          if (type === LENS && used > ENOUGH_LENS || type === DISTS && used > ENOUGH_DISTS) {
            return 1;
          }
          low = huff & mask;
          table[low] = root << 24 | curr << 16 | next - table_index | 0;
        }
      }
      if (huff !== 0) {
        table[next + huff] = len - drop << 24 | 64 << 16 | 0;
      }
      opts.bits = root;
      return 0;
    };
  }
});

// node_modules/pako/lib/zlib/inflate.js
var require_inflate = __commonJS({
  "node_modules/pako/lib/zlib/inflate.js"(exports2) {
    "use strict";
    var utils = require_common();
    var adler32 = require_adler32();
    var crc32 = require_crc32();
    var inflate_fast = require_inffast();
    var inflate_table = require_inftrees();
    var CODES = 0;
    var LENS = 1;
    var DISTS = 2;
    var Z_FINISH = 4;
    var Z_BLOCK = 5;
    var Z_TREES = 6;
    var Z_OK = 0;
    var Z_STREAM_END = 1;
    var Z_NEED_DICT = 2;
    var Z_STREAM_ERROR = -2;
    var Z_DATA_ERROR = -3;
    var Z_MEM_ERROR = -4;
    var Z_BUF_ERROR = -5;
    var Z_DEFLATED = 8;
    var HEAD = 1;
    var FLAGS = 2;
    var TIME = 3;
    var OS = 4;
    var EXLEN = 5;
    var EXTRA = 6;
    var NAME = 7;
    var COMMENT = 8;
    var HCRC = 9;
    var DICTID = 10;
    var DICT = 11;
    var TYPE = 12;
    var TYPEDO = 13;
    var STORED = 14;
    var COPY_ = 15;
    var COPY = 16;
    var TABLE = 17;
    var LENLENS = 18;
    var CODELENS = 19;
    var LEN_ = 20;
    var LEN = 21;
    var LENEXT = 22;
    var DIST = 23;
    var DISTEXT = 24;
    var MATCH = 25;
    var LIT = 26;
    var CHECK = 27;
    var LENGTH = 28;
    var DONE = 29;
    var BAD = 30;
    var MEM = 31;
    var SYNC = 32;
    var ENOUGH_LENS = 852;
    var ENOUGH_DISTS = 592;
    var MAX_WBITS = 15;
    var DEF_WBITS = MAX_WBITS;
    function zswap32(q) {
      return (q >>> 24 & 255) + (q >>> 8 & 65280) + ((q & 65280) << 8) + ((q & 255) << 24);
    }
    function InflateState() {
      this.mode = 0;
      this.last = false;
      this.wrap = 0;
      this.havedict = false;
      this.flags = 0;
      this.dmax = 0;
      this.check = 0;
      this.total = 0;
      this.head = null;
      this.wbits = 0;
      this.wsize = 0;
      this.whave = 0;
      this.wnext = 0;
      this.window = null;
      this.hold = 0;
      this.bits = 0;
      this.length = 0;
      this.offset = 0;
      this.extra = 0;
      this.lencode = null;
      this.distcode = null;
      this.lenbits = 0;
      this.distbits = 0;
      this.ncode = 0;
      this.nlen = 0;
      this.ndist = 0;
      this.have = 0;
      this.next = null;
      this.lens = new utils.Buf16(320);
      this.work = new utils.Buf16(288);
      this.lendyn = null;
      this.distdyn = null;
      this.sane = 0;
      this.back = 0;
      this.was = 0;
    }
    function inflateResetKeep(strm) {
      var state;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      strm.total_in = strm.total_out = state.total = 0;
      strm.msg = "";
      if (state.wrap) {
        strm.adler = state.wrap & 1;
      }
      state.mode = HEAD;
      state.last = 0;
      state.havedict = 0;
      state.dmax = 32768;
      state.head = null;
      state.hold = 0;
      state.bits = 0;
      state.lencode = state.lendyn = new utils.Buf32(ENOUGH_LENS);
      state.distcode = state.distdyn = new utils.Buf32(ENOUGH_DISTS);
      state.sane = 1;
      state.back = -1;
      return Z_OK;
    }
    function inflateReset(strm) {
      var state;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      state.wsize = 0;
      state.whave = 0;
      state.wnext = 0;
      return inflateResetKeep(strm);
    }
    function inflateReset2(strm, windowBits) {
      var wrap;
      var state;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      if (windowBits < 0) {
        wrap = 0;
        windowBits = -windowBits;
      } else {
        wrap = (windowBits >> 4) + 1;
        if (windowBits < 48) {
          windowBits &= 15;
        }
      }
      if (windowBits && (windowBits < 8 || windowBits > 15)) {
        return Z_STREAM_ERROR;
      }
      if (state.window !== null && state.wbits !== windowBits) {
        state.window = null;
      }
      state.wrap = wrap;
      state.wbits = windowBits;
      return inflateReset(strm);
    }
    function inflateInit2(strm, windowBits) {
      var ret;
      var state;
      if (!strm) {
        return Z_STREAM_ERROR;
      }
      state = new InflateState();
      strm.state = state;
      state.window = null;
      ret = inflateReset2(strm, windowBits);
      if (ret !== Z_OK) {
        strm.state = null;
      }
      return ret;
    }
    function inflateInit(strm) {
      return inflateInit2(strm, DEF_WBITS);
    }
    var virgin = true;
    var lenfix;
    var distfix;
    function fixedtables(state) {
      if (virgin) {
        var sym;
        lenfix = new utils.Buf32(512);
        distfix = new utils.Buf32(32);
        sym = 0;
        while (sym < 144) {
          state.lens[sym++] = 8;
        }
        while (sym < 256) {
          state.lens[sym++] = 9;
        }
        while (sym < 280) {
          state.lens[sym++] = 7;
        }
        while (sym < 288) {
          state.lens[sym++] = 8;
        }
        inflate_table(LENS, state.lens, 0, 288, lenfix, 0, state.work, { bits: 9 });
        sym = 0;
        while (sym < 32) {
          state.lens[sym++] = 5;
        }
        inflate_table(DISTS, state.lens, 0, 32, distfix, 0, state.work, { bits: 5 });
        virgin = false;
      }
      state.lencode = lenfix;
      state.lenbits = 9;
      state.distcode = distfix;
      state.distbits = 5;
    }
    function updatewindow(strm, src, end, copy) {
      var dist;
      var state = strm.state;
      if (state.window === null) {
        state.wsize = 1 << state.wbits;
        state.wnext = 0;
        state.whave = 0;
        state.window = new utils.Buf8(state.wsize);
      }
      if (copy >= state.wsize) {
        utils.arraySet(state.window, src, end - state.wsize, state.wsize, 0);
        state.wnext = 0;
        state.whave = state.wsize;
      } else {
        dist = state.wsize - state.wnext;
        if (dist > copy) {
          dist = copy;
        }
        utils.arraySet(state.window, src, end - copy, dist, state.wnext);
        copy -= dist;
        if (copy) {
          utils.arraySet(state.window, src, end - copy, copy, 0);
          state.wnext = copy;
          state.whave = state.wsize;
        } else {
          state.wnext += dist;
          if (state.wnext === state.wsize) {
            state.wnext = 0;
          }
          if (state.whave < state.wsize) {
            state.whave += dist;
          }
        }
      }
      return 0;
    }
    function inflate(strm, flush) {
      var state;
      var input, output;
      var next;
      var put;
      var have, left;
      var hold;
      var bits;
      var _in, _out;
      var copy;
      var from;
      var from_source;
      var here = 0;
      var here_bits, here_op, here_val;
      var last_bits, last_op, last_val;
      var len;
      var ret;
      var hbuf = new utils.Buf8(4);
      var opts;
      var n;
      var order = (
        /* permutation of code lengths */
        [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
      );
      if (!strm || !strm.state || !strm.output || !strm.input && strm.avail_in !== 0) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      if (state.mode === TYPE) {
        state.mode = TYPEDO;
      }
      put = strm.next_out;
      output = strm.output;
      left = strm.avail_out;
      next = strm.next_in;
      input = strm.input;
      have = strm.avail_in;
      hold = state.hold;
      bits = state.bits;
      _in = have;
      _out = left;
      ret = Z_OK;
      inf_leave:
        for (; ; ) {
          switch (state.mode) {
            case HEAD:
              if (state.wrap === 0) {
                state.mode = TYPEDO;
                break;
              }
              while (bits < 16) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if (state.wrap & 2 && hold === 35615) {
                state.check = 0;
                hbuf[0] = hold & 255;
                hbuf[1] = hold >>> 8 & 255;
                state.check = crc32(state.check, hbuf, 2, 0);
                hold = 0;
                bits = 0;
                state.mode = FLAGS;
                break;
              }
              state.flags = 0;
              if (state.head) {
                state.head.done = false;
              }
              if (!(state.wrap & 1) || /* check if zlib header allowed */
              (((hold & 255) << 8) + (hold >> 8)) % 31) {
                strm.msg = "incorrect header check";
                state.mode = BAD;
                break;
              }
              if ((hold & 15) !== Z_DEFLATED) {
                strm.msg = "unknown compression method";
                state.mode = BAD;
                break;
              }
              hold >>>= 4;
              bits -= 4;
              len = (hold & 15) + 8;
              if (state.wbits === 0) {
                state.wbits = len;
              } else if (len > state.wbits) {
                strm.msg = "invalid window size";
                state.mode = BAD;
                break;
              }
              state.dmax = 1 << len;
              strm.adler = state.check = 1;
              state.mode = hold & 512 ? DICTID : TYPE;
              hold = 0;
              bits = 0;
              break;
            case FLAGS:
              while (bits < 16) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              state.flags = hold;
              if ((state.flags & 255) !== Z_DEFLATED) {
                strm.msg = "unknown compression method";
                state.mode = BAD;
                break;
              }
              if (state.flags & 57344) {
                strm.msg = "unknown header flags set";
                state.mode = BAD;
                break;
              }
              if (state.head) {
                state.head.text = hold >> 8 & 1;
              }
              if (state.flags & 512) {
                hbuf[0] = hold & 255;
                hbuf[1] = hold >>> 8 & 255;
                state.check = crc32(state.check, hbuf, 2, 0);
              }
              hold = 0;
              bits = 0;
              state.mode = TIME;
            /* falls through */
            case TIME:
              while (bits < 32) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if (state.head) {
                state.head.time = hold;
              }
              if (state.flags & 512) {
                hbuf[0] = hold & 255;
                hbuf[1] = hold >>> 8 & 255;
                hbuf[2] = hold >>> 16 & 255;
                hbuf[3] = hold >>> 24 & 255;
                state.check = crc32(state.check, hbuf, 4, 0);
              }
              hold = 0;
              bits = 0;
              state.mode = OS;
            /* falls through */
            case OS:
              while (bits < 16) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if (state.head) {
                state.head.xflags = hold & 255;
                state.head.os = hold >> 8;
              }
              if (state.flags & 512) {
                hbuf[0] = hold & 255;
                hbuf[1] = hold >>> 8 & 255;
                state.check = crc32(state.check, hbuf, 2, 0);
              }
              hold = 0;
              bits = 0;
              state.mode = EXLEN;
            /* falls through */
            case EXLEN:
              if (state.flags & 1024) {
                while (bits < 16) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                state.length = hold;
                if (state.head) {
                  state.head.extra_len = hold;
                }
                if (state.flags & 512) {
                  hbuf[0] = hold & 255;
                  hbuf[1] = hold >>> 8 & 255;
                  state.check = crc32(state.check, hbuf, 2, 0);
                }
                hold = 0;
                bits = 0;
              } else if (state.head) {
                state.head.extra = null;
              }
              state.mode = EXTRA;
            /* falls through */
            case EXTRA:
              if (state.flags & 1024) {
                copy = state.length;
                if (copy > have) {
                  copy = have;
                }
                if (copy) {
                  if (state.head) {
                    len = state.head.extra_len - state.length;
                    if (!state.head.extra) {
                      state.head.extra = new Array(state.head.extra_len);
                    }
                    utils.arraySet(
                      state.head.extra,
                      input,
                      next,
                      // extra field is limited to 65536 bytes
                      // - no need for additional size check
                      copy,
                      /*len + copy > state.head.extra_max - len ? state.head.extra_max : copy,*/
                      len
                    );
                  }
                  if (state.flags & 512) {
                    state.check = crc32(state.check, input, copy, next);
                  }
                  have -= copy;
                  next += copy;
                  state.length -= copy;
                }
                if (state.length) {
                  break inf_leave;
                }
              }
              state.length = 0;
              state.mode = NAME;
            /* falls through */
            case NAME:
              if (state.flags & 2048) {
                if (have === 0) {
                  break inf_leave;
                }
                copy = 0;
                do {
                  len = input[next + copy++];
                  if (state.head && len && state.length < 65536) {
                    state.head.name += String.fromCharCode(len);
                  }
                } while (len && copy < have);
                if (state.flags & 512) {
                  state.check = crc32(state.check, input, copy, next);
                }
                have -= copy;
                next += copy;
                if (len) {
                  break inf_leave;
                }
              } else if (state.head) {
                state.head.name = null;
              }
              state.length = 0;
              state.mode = COMMENT;
            /* falls through */
            case COMMENT:
              if (state.flags & 4096) {
                if (have === 0) {
                  break inf_leave;
                }
                copy = 0;
                do {
                  len = input[next + copy++];
                  if (state.head && len && state.length < 65536) {
                    state.head.comment += String.fromCharCode(len);
                  }
                } while (len && copy < have);
                if (state.flags & 512) {
                  state.check = crc32(state.check, input, copy, next);
                }
                have -= copy;
                next += copy;
                if (len) {
                  break inf_leave;
                }
              } else if (state.head) {
                state.head.comment = null;
              }
              state.mode = HCRC;
            /* falls through */
            case HCRC:
              if (state.flags & 512) {
                while (bits < 16) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                if (hold !== (state.check & 65535)) {
                  strm.msg = "header crc mismatch";
                  state.mode = BAD;
                  break;
                }
                hold = 0;
                bits = 0;
              }
              if (state.head) {
                state.head.hcrc = state.flags >> 9 & 1;
                state.head.done = true;
              }
              strm.adler = state.check = 0;
              state.mode = TYPE;
              break;
            case DICTID:
              while (bits < 32) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              strm.adler = state.check = zswap32(hold);
              hold = 0;
              bits = 0;
              state.mode = DICT;
            /* falls through */
            case DICT:
              if (state.havedict === 0) {
                strm.next_out = put;
                strm.avail_out = left;
                strm.next_in = next;
                strm.avail_in = have;
                state.hold = hold;
                state.bits = bits;
                return Z_NEED_DICT;
              }
              strm.adler = state.check = 1;
              state.mode = TYPE;
            /* falls through */
            case TYPE:
              if (flush === Z_BLOCK || flush === Z_TREES) {
                break inf_leave;
              }
            /* falls through */
            case TYPEDO:
              if (state.last) {
                hold >>>= bits & 7;
                bits -= bits & 7;
                state.mode = CHECK;
                break;
              }
              while (bits < 3) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              state.last = hold & 1;
              hold >>>= 1;
              bits -= 1;
              switch (hold & 3) {
                case 0:
                  state.mode = STORED;
                  break;
                case 1:
                  fixedtables(state);
                  state.mode = LEN_;
                  if (flush === Z_TREES) {
                    hold >>>= 2;
                    bits -= 2;
                    break inf_leave;
                  }
                  break;
                case 2:
                  state.mode = TABLE;
                  break;
                case 3:
                  strm.msg = "invalid block type";
                  state.mode = BAD;
              }
              hold >>>= 2;
              bits -= 2;
              break;
            case STORED:
              hold >>>= bits & 7;
              bits -= bits & 7;
              while (bits < 32) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if ((hold & 65535) !== (hold >>> 16 ^ 65535)) {
                strm.msg = "invalid stored block lengths";
                state.mode = BAD;
                break;
              }
              state.length = hold & 65535;
              hold = 0;
              bits = 0;
              state.mode = COPY_;
              if (flush === Z_TREES) {
                break inf_leave;
              }
            /* falls through */
            case COPY_:
              state.mode = COPY;
            /* falls through */
            case COPY:
              copy = state.length;
              if (copy) {
                if (copy > have) {
                  copy = have;
                }
                if (copy > left) {
                  copy = left;
                }
                if (copy === 0) {
                  break inf_leave;
                }
                utils.arraySet(output, input, next, copy, put);
                have -= copy;
                next += copy;
                left -= copy;
                put += copy;
                state.length -= copy;
                break;
              }
              state.mode = TYPE;
              break;
            case TABLE:
              while (bits < 14) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              state.nlen = (hold & 31) + 257;
              hold >>>= 5;
              bits -= 5;
              state.ndist = (hold & 31) + 1;
              hold >>>= 5;
              bits -= 5;
              state.ncode = (hold & 15) + 4;
              hold >>>= 4;
              bits -= 4;
              if (state.nlen > 286 || state.ndist > 30) {
                strm.msg = "too many length or distance symbols";
                state.mode = BAD;
                break;
              }
              state.have = 0;
              state.mode = LENLENS;
            /* falls through */
            case LENLENS:
              while (state.have < state.ncode) {
                while (bits < 3) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                state.lens[order[state.have++]] = hold & 7;
                hold >>>= 3;
                bits -= 3;
              }
              while (state.have < 19) {
                state.lens[order[state.have++]] = 0;
              }
              state.lencode = state.lendyn;
              state.lenbits = 7;
              opts = { bits: state.lenbits };
              ret = inflate_table(CODES, state.lens, 0, 19, state.lencode, 0, state.work, opts);
              state.lenbits = opts.bits;
              if (ret) {
                strm.msg = "invalid code lengths set";
                state.mode = BAD;
                break;
              }
              state.have = 0;
              state.mode = CODELENS;
            /* falls through */
            case CODELENS:
              while (state.have < state.nlen + state.ndist) {
                for (; ; ) {
                  here = state.lencode[hold & (1 << state.lenbits) - 1];
                  here_bits = here >>> 24;
                  here_op = here >>> 16 & 255;
                  here_val = here & 65535;
                  if (here_bits <= bits) {
                    break;
                  }
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                if (here_val < 16) {
                  hold >>>= here_bits;
                  bits -= here_bits;
                  state.lens[state.have++] = here_val;
                } else {
                  if (here_val === 16) {
                    n = here_bits + 2;
                    while (bits < n) {
                      if (have === 0) {
                        break inf_leave;
                      }
                      have--;
                      hold += input[next++] << bits;
                      bits += 8;
                    }
                    hold >>>= here_bits;
                    bits -= here_bits;
                    if (state.have === 0) {
                      strm.msg = "invalid bit length repeat";
                      state.mode = BAD;
                      break;
                    }
                    len = state.lens[state.have - 1];
                    copy = 3 + (hold & 3);
                    hold >>>= 2;
                    bits -= 2;
                  } else if (here_val === 17) {
                    n = here_bits + 3;
                    while (bits < n) {
                      if (have === 0) {
                        break inf_leave;
                      }
                      have--;
                      hold += input[next++] << bits;
                      bits += 8;
                    }
                    hold >>>= here_bits;
                    bits -= here_bits;
                    len = 0;
                    copy = 3 + (hold & 7);
                    hold >>>= 3;
                    bits -= 3;
                  } else {
                    n = here_bits + 7;
                    while (bits < n) {
                      if (have === 0) {
                        break inf_leave;
                      }
                      have--;
                      hold += input[next++] << bits;
                      bits += 8;
                    }
                    hold >>>= here_bits;
                    bits -= here_bits;
                    len = 0;
                    copy = 11 + (hold & 127);
                    hold >>>= 7;
                    bits -= 7;
                  }
                  if (state.have + copy > state.nlen + state.ndist) {
                    strm.msg = "invalid bit length repeat";
                    state.mode = BAD;
                    break;
                  }
                  while (copy--) {
                    state.lens[state.have++] = len;
                  }
                }
              }
              if (state.mode === BAD) {
                break;
              }
              if (state.lens[256] === 0) {
                strm.msg = "invalid code -- missing end-of-block";
                state.mode = BAD;
                break;
              }
              state.lenbits = 9;
              opts = { bits: state.lenbits };
              ret = inflate_table(LENS, state.lens, 0, state.nlen, state.lencode, 0, state.work, opts);
              state.lenbits = opts.bits;
              if (ret) {
                strm.msg = "invalid literal/lengths set";
                state.mode = BAD;
                break;
              }
              state.distbits = 6;
              state.distcode = state.distdyn;
              opts = { bits: state.distbits };
              ret = inflate_table(DISTS, state.lens, state.nlen, state.ndist, state.distcode, 0, state.work, opts);
              state.distbits = opts.bits;
              if (ret) {
                strm.msg = "invalid distances set";
                state.mode = BAD;
                break;
              }
              state.mode = LEN_;
              if (flush === Z_TREES) {
                break inf_leave;
              }
            /* falls through */
            case LEN_:
              state.mode = LEN;
            /* falls through */
            case LEN:
              if (have >= 6 && left >= 258) {
                strm.next_out = put;
                strm.avail_out = left;
                strm.next_in = next;
                strm.avail_in = have;
                state.hold = hold;
                state.bits = bits;
                inflate_fast(strm, _out);
                put = strm.next_out;
                output = strm.output;
                left = strm.avail_out;
                next = strm.next_in;
                input = strm.input;
                have = strm.avail_in;
                hold = state.hold;
                bits = state.bits;
                if (state.mode === TYPE) {
                  state.back = -1;
                }
                break;
              }
              state.back = 0;
              for (; ; ) {
                here = state.lencode[hold & (1 << state.lenbits) - 1];
                here_bits = here >>> 24;
                here_op = here >>> 16 & 255;
                here_val = here & 65535;
                if (here_bits <= bits) {
                  break;
                }
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if (here_op && (here_op & 240) === 0) {
                last_bits = here_bits;
                last_op = here_op;
                last_val = here_val;
                for (; ; ) {
                  here = state.lencode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
                  here_bits = here >>> 24;
                  here_op = here >>> 16 & 255;
                  here_val = here & 65535;
                  if (last_bits + here_bits <= bits) {
                    break;
                  }
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                hold >>>= last_bits;
                bits -= last_bits;
                state.back += last_bits;
              }
              hold >>>= here_bits;
              bits -= here_bits;
              state.back += here_bits;
              state.length = here_val;
              if (here_op === 0) {
                state.mode = LIT;
                break;
              }
              if (here_op & 32) {
                state.back = -1;
                state.mode = TYPE;
                break;
              }
              if (here_op & 64) {
                strm.msg = "invalid literal/length code";
                state.mode = BAD;
                break;
              }
              state.extra = here_op & 15;
              state.mode = LENEXT;
            /* falls through */
            case LENEXT:
              if (state.extra) {
                n = state.extra;
                while (bits < n) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                state.length += hold & (1 << state.extra) - 1;
                hold >>>= state.extra;
                bits -= state.extra;
                state.back += state.extra;
              }
              state.was = state.length;
              state.mode = DIST;
            /* falls through */
            case DIST:
              for (; ; ) {
                here = state.distcode[hold & (1 << state.distbits) - 1];
                here_bits = here >>> 24;
                here_op = here >>> 16 & 255;
                here_val = here & 65535;
                if (here_bits <= bits) {
                  break;
                }
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if ((here_op & 240) === 0) {
                last_bits = here_bits;
                last_op = here_op;
                last_val = here_val;
                for (; ; ) {
                  here = state.distcode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
                  here_bits = here >>> 24;
                  here_op = here >>> 16 & 255;
                  here_val = here & 65535;
                  if (last_bits + here_bits <= bits) {
                    break;
                  }
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                hold >>>= last_bits;
                bits -= last_bits;
                state.back += last_bits;
              }
              hold >>>= here_bits;
              bits -= here_bits;
              state.back += here_bits;
              if (here_op & 64) {
                strm.msg = "invalid distance code";
                state.mode = BAD;
                break;
              }
              state.offset = here_val;
              state.extra = here_op & 15;
              state.mode = DISTEXT;
            /* falls through */
            case DISTEXT:
              if (state.extra) {
                n = state.extra;
                while (bits < n) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                state.offset += hold & (1 << state.extra) - 1;
                hold >>>= state.extra;
                bits -= state.extra;
                state.back += state.extra;
              }
              if (state.offset > state.dmax) {
                strm.msg = "invalid distance too far back";
                state.mode = BAD;
                break;
              }
              state.mode = MATCH;
            /* falls through */
            case MATCH:
              if (left === 0) {
                break inf_leave;
              }
              copy = _out - left;
              if (state.offset > copy) {
                copy = state.offset - copy;
                if (copy > state.whave) {
                  if (state.sane) {
                    strm.msg = "invalid distance too far back";
                    state.mode = BAD;
                    break;
                  }
                }
                if (copy > state.wnext) {
                  copy -= state.wnext;
                  from = state.wsize - copy;
                } else {
                  from = state.wnext - copy;
                }
                if (copy > state.length) {
                  copy = state.length;
                }
                from_source = state.window;
              } else {
                from_source = output;
                from = put - state.offset;
                copy = state.length;
              }
              if (copy > left) {
                copy = left;
              }
              left -= copy;
              state.length -= copy;
              do {
                output[put++] = from_source[from++];
              } while (--copy);
              if (state.length === 0) {
                state.mode = LEN;
              }
              break;
            case LIT:
              if (left === 0) {
                break inf_leave;
              }
              output[put++] = state.length;
              left--;
              state.mode = LEN;
              break;
            case CHECK:
              if (state.wrap) {
                while (bits < 32) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold |= input[next++] << bits;
                  bits += 8;
                }
                _out -= left;
                strm.total_out += _out;
                state.total += _out;
                if (_out) {
                  strm.adler = state.check = /*UPDATE(state.check, put - _out, _out);*/
                  state.flags ? crc32(state.check, output, _out, put - _out) : adler32(state.check, output, _out, put - _out);
                }
                _out = left;
                if ((state.flags ? hold : zswap32(hold)) !== state.check) {
                  strm.msg = "incorrect data check";
                  state.mode = BAD;
                  break;
                }
                hold = 0;
                bits = 0;
              }
              state.mode = LENGTH;
            /* falls through */
            case LENGTH:
              if (state.wrap && state.flags) {
                while (bits < 32) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                if (hold !== (state.total & 4294967295)) {
                  strm.msg = "incorrect length check";
                  state.mode = BAD;
                  break;
                }
                hold = 0;
                bits = 0;
              }
              state.mode = DONE;
            /* falls through */
            case DONE:
              ret = Z_STREAM_END;
              break inf_leave;
            case BAD:
              ret = Z_DATA_ERROR;
              break inf_leave;
            case MEM:
              return Z_MEM_ERROR;
            case SYNC:
            /* falls through */
            default:
              return Z_STREAM_ERROR;
          }
        }
      strm.next_out = put;
      strm.avail_out = left;
      strm.next_in = next;
      strm.avail_in = have;
      state.hold = hold;
      state.bits = bits;
      if (state.wsize || _out !== strm.avail_out && state.mode < BAD && (state.mode < CHECK || flush !== Z_FINISH)) {
        if (updatewindow(strm, strm.output, strm.next_out, _out - strm.avail_out)) {
          state.mode = MEM;
          return Z_MEM_ERROR;
        }
      }
      _in -= strm.avail_in;
      _out -= strm.avail_out;
      strm.total_in += _in;
      strm.total_out += _out;
      state.total += _out;
      if (state.wrap && _out) {
        strm.adler = state.check = /*UPDATE(state.check, strm.next_out - _out, _out);*/
        state.flags ? crc32(state.check, output, _out, strm.next_out - _out) : adler32(state.check, output, _out, strm.next_out - _out);
      }
      strm.data_type = state.bits + (state.last ? 64 : 0) + (state.mode === TYPE ? 128 : 0) + (state.mode === LEN_ || state.mode === COPY_ ? 256 : 0);
      if ((_in === 0 && _out === 0 || flush === Z_FINISH) && ret === Z_OK) {
        ret = Z_BUF_ERROR;
      }
      return ret;
    }
    function inflateEnd(strm) {
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      var state = strm.state;
      if (state.window) {
        state.window = null;
      }
      strm.state = null;
      return Z_OK;
    }
    function inflateGetHeader(strm, head) {
      var state;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      if ((state.wrap & 2) === 0) {
        return Z_STREAM_ERROR;
      }
      state.head = head;
      head.done = false;
      return Z_OK;
    }
    function inflateSetDictionary(strm, dictionary) {
      var dictLength = dictionary.length;
      var state;
      var dictid;
      var ret;
      if (!strm || !strm.state) {
        return Z_STREAM_ERROR;
      }
      state = strm.state;
      if (state.wrap !== 0 && state.mode !== DICT) {
        return Z_STREAM_ERROR;
      }
      if (state.mode === DICT) {
        dictid = 1;
        dictid = adler32(dictid, dictionary, dictLength, 0);
        if (dictid !== state.check) {
          return Z_DATA_ERROR;
        }
      }
      ret = updatewindow(strm, dictionary, dictLength, dictLength);
      if (ret) {
        state.mode = MEM;
        return Z_MEM_ERROR;
      }
      state.havedict = 1;
      return Z_OK;
    }
    exports2.inflateReset = inflateReset;
    exports2.inflateReset2 = inflateReset2;
    exports2.inflateResetKeep = inflateResetKeep;
    exports2.inflateInit = inflateInit;
    exports2.inflateInit2 = inflateInit2;
    exports2.inflate = inflate;
    exports2.inflateEnd = inflateEnd;
    exports2.inflateGetHeader = inflateGetHeader;
    exports2.inflateSetDictionary = inflateSetDictionary;
    exports2.inflateInfo = "pako inflate (from Nodeca project)";
  }
});

// node_modules/pako/lib/zlib/constants.js
var require_constants = __commonJS({
  "node_modules/pako/lib/zlib/constants.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      /* Allowed flush values; see deflate() and inflate() below for details */
      Z_NO_FLUSH: 0,
      Z_PARTIAL_FLUSH: 1,
      Z_SYNC_FLUSH: 2,
      Z_FULL_FLUSH: 3,
      Z_FINISH: 4,
      Z_BLOCK: 5,
      Z_TREES: 6,
      /* Return codes for the compression/decompression functions. Negative values
      * are errors, positive values are used for special but normal events.
      */
      Z_OK: 0,
      Z_STREAM_END: 1,
      Z_NEED_DICT: 2,
      Z_ERRNO: -1,
      Z_STREAM_ERROR: -2,
      Z_DATA_ERROR: -3,
      //Z_MEM_ERROR:     -4,
      Z_BUF_ERROR: -5,
      //Z_VERSION_ERROR: -6,
      /* compression levels */
      Z_NO_COMPRESSION: 0,
      Z_BEST_SPEED: 1,
      Z_BEST_COMPRESSION: 9,
      Z_DEFAULT_COMPRESSION: -1,
      Z_FILTERED: 1,
      Z_HUFFMAN_ONLY: 2,
      Z_RLE: 3,
      Z_FIXED: 4,
      Z_DEFAULT_STRATEGY: 0,
      /* Possible values of the data_type field (though see inflate()) */
      Z_BINARY: 0,
      Z_TEXT: 1,
      //Z_ASCII:                1, // = Z_TEXT (deprecated)
      Z_UNKNOWN: 2,
      /* The deflate compression method */
      Z_DEFLATED: 8
      //Z_NULL:                 null // Use -1 or null inline, depending on var type
    };
  }
});

// node_modules/pako/lib/zlib/gzheader.js
var require_gzheader = __commonJS({
  "node_modules/pako/lib/zlib/gzheader.js"(exports2, module2) {
    "use strict";
    function GZheader() {
      this.text = 0;
      this.time = 0;
      this.xflags = 0;
      this.os = 0;
      this.extra = null;
      this.extra_len = 0;
      this.name = "";
      this.comment = "";
      this.hcrc = 0;
      this.done = false;
    }
    module2.exports = GZheader;
  }
});

// node_modules/pako/lib/inflate.js
var require_inflate2 = __commonJS({
  "node_modules/pako/lib/inflate.js"(exports2) {
    "use strict";
    var zlib_inflate = require_inflate();
    var utils = require_common();
    var strings = require_strings();
    var c = require_constants();
    var msg = require_messages();
    var ZStream = require_zstream();
    var GZheader = require_gzheader();
    var toString = Object.prototype.toString;
    function Inflate(options) {
      if (!(this instanceof Inflate)) return new Inflate(options);
      this.options = utils.assign({
        chunkSize: 16384,
        windowBits: 0,
        to: ""
      }, options || {});
      var opt = this.options;
      if (opt.raw && opt.windowBits >= 0 && opt.windowBits < 16) {
        opt.windowBits = -opt.windowBits;
        if (opt.windowBits === 0) {
          opt.windowBits = -15;
        }
      }
      if (opt.windowBits >= 0 && opt.windowBits < 16 && !(options && options.windowBits)) {
        opt.windowBits += 32;
      }
      if (opt.windowBits > 15 && opt.windowBits < 48) {
        if ((opt.windowBits & 15) === 0) {
          opt.windowBits |= 15;
        }
      }
      this.err = 0;
      this.msg = "";
      this.ended = false;
      this.chunks = [];
      this.strm = new ZStream();
      this.strm.avail_out = 0;
      var status = zlib_inflate.inflateInit2(
        this.strm,
        opt.windowBits
      );
      if (status !== c.Z_OK) {
        throw new Error(msg[status]);
      }
      this.header = new GZheader();
      zlib_inflate.inflateGetHeader(this.strm, this.header);
      if (opt.dictionary) {
        if (typeof opt.dictionary === "string") {
          opt.dictionary = strings.string2buf(opt.dictionary);
        } else if (toString.call(opt.dictionary) === "[object ArrayBuffer]") {
          opt.dictionary = new Uint8Array(opt.dictionary);
        }
        if (opt.raw) {
          status = zlib_inflate.inflateSetDictionary(this.strm, opt.dictionary);
          if (status !== c.Z_OK) {
            throw new Error(msg[status]);
          }
        }
      }
    }
    Inflate.prototype.push = function(data, mode) {
      var strm = this.strm;
      var chunkSize = this.options.chunkSize;
      var dictionary = this.options.dictionary;
      var status, _mode;
      var next_out_utf8, tail, utf8str;
      var allowBufError = false;
      if (this.ended) {
        return false;
      }
      _mode = mode === ~~mode ? mode : mode === true ? c.Z_FINISH : c.Z_NO_FLUSH;
      if (typeof data === "string") {
        strm.input = strings.binstring2buf(data);
      } else if (toString.call(data) === "[object ArrayBuffer]") {
        strm.input = new Uint8Array(data);
      } else {
        strm.input = data;
      }
      strm.next_in = 0;
      strm.avail_in = strm.input.length;
      do {
        if (strm.avail_out === 0) {
          strm.output = new utils.Buf8(chunkSize);
          strm.next_out = 0;
          strm.avail_out = chunkSize;
        }
        status = zlib_inflate.inflate(strm, c.Z_NO_FLUSH);
        if (status === c.Z_NEED_DICT && dictionary) {
          status = zlib_inflate.inflateSetDictionary(this.strm, dictionary);
        }
        if (status === c.Z_BUF_ERROR && allowBufError === true) {
          status = c.Z_OK;
          allowBufError = false;
        }
        if (status !== c.Z_STREAM_END && status !== c.Z_OK) {
          this.onEnd(status);
          this.ended = true;
          return false;
        }
        if (strm.next_out) {
          if (strm.avail_out === 0 || status === c.Z_STREAM_END || strm.avail_in === 0 && (_mode === c.Z_FINISH || _mode === c.Z_SYNC_FLUSH)) {
            if (this.options.to === "string") {
              next_out_utf8 = strings.utf8border(strm.output, strm.next_out);
              tail = strm.next_out - next_out_utf8;
              utf8str = strings.buf2string(strm.output, next_out_utf8);
              strm.next_out = tail;
              strm.avail_out = chunkSize - tail;
              if (tail) {
                utils.arraySet(strm.output, strm.output, next_out_utf8, tail, 0);
              }
              this.onData(utf8str);
            } else {
              this.onData(utils.shrinkBuf(strm.output, strm.next_out));
            }
          }
        }
        if (strm.avail_in === 0 && strm.avail_out === 0) {
          allowBufError = true;
        }
      } while ((strm.avail_in > 0 || strm.avail_out === 0) && status !== c.Z_STREAM_END);
      if (status === c.Z_STREAM_END) {
        _mode = c.Z_FINISH;
      }
      if (_mode === c.Z_FINISH) {
        status = zlib_inflate.inflateEnd(this.strm);
        this.onEnd(status);
        this.ended = true;
        return status === c.Z_OK;
      }
      if (_mode === c.Z_SYNC_FLUSH) {
        this.onEnd(c.Z_OK);
        strm.avail_out = 0;
        return true;
      }
      return true;
    };
    Inflate.prototype.onData = function(chunk) {
      this.chunks.push(chunk);
    };
    Inflate.prototype.onEnd = function(status) {
      if (status === c.Z_OK) {
        if (this.options.to === "string") {
          this.result = this.chunks.join("");
        } else {
          this.result = utils.flattenChunks(this.chunks);
        }
      }
      this.chunks = [];
      this.err = status;
      this.msg = this.strm.msg;
    };
    function inflate(input, options) {
      var inflator = new Inflate(options);
      inflator.push(input, true);
      if (inflator.err) {
        throw inflator.msg || msg[inflator.err];
      }
      return inflator.result;
    }
    function inflateRaw(input, options) {
      options = options || {};
      options.raw = true;
      return inflate(input, options);
    }
    exports2.Inflate = Inflate;
    exports2.inflate = inflate;
    exports2.inflateRaw = inflateRaw;
    exports2.ungzip = inflate;
  }
});

// node_modules/pako/index.js
var require_pako = __commonJS({
  "node_modules/pako/index.js"(exports2, module2) {
    "use strict";
    var assign = require_common().assign;
    var deflate = require_deflate2();
    var inflate = require_inflate2();
    var constants = require_constants();
    var pako2 = {};
    assign(pako2, deflate, inflate, constants);
    module2.exports = pako2;
  }
});

// node_modules/@assemblyscript/loader/umd/index.js
var require_umd = __commonJS({
  "node_modules/@assemblyscript/loader/umd/index.js"(exports2, module2) {
    var loader = (function(exports3) {
      "use strict";
      Object.defineProperty(exports3, "__esModule", {
        value: true
      });
      exports3.default = void 0;
      exports3.demangle = demangle;
      exports3.instantiate = instantiate;
      exports3.instantiateStreaming = instantiateStreaming;
      exports3.instantiateSync = instantiateSync;
      const ID_OFFSET = -8;
      const SIZE_OFFSET = -4;
      const ARRAYBUFFER_ID = 0;
      const STRING_ID = 1;
      const ARRAYBUFFERVIEW = 1 << 0;
      const ARRAY = 1 << 1;
      const STATICARRAY = 1 << 2;
      const VAL_ALIGN_OFFSET = 6;
      const VAL_SIGNED = 1 << 11;
      const VAL_FLOAT = 1 << 12;
      const VAL_MANAGED = 1 << 14;
      const ARRAYBUFFERVIEW_BUFFER_OFFSET = 0;
      const ARRAYBUFFERVIEW_DATASTART_OFFSET = 4;
      const ARRAYBUFFERVIEW_BYTELENGTH_OFFSET = 8;
      const ARRAYBUFFERVIEW_SIZE = 12;
      const ARRAY_LENGTH_OFFSET = 12;
      const ARRAY_SIZE = 16;
      const E_NO_EXPORT_TABLE = "Operation requires compiling with --exportTable";
      const E_NO_EXPORT_RUNTIME = "Operation requires compiling with --exportRuntime";
      const F_NO_EXPORT_RUNTIME = () => {
        throw Error(E_NO_EXPORT_RUNTIME);
      };
      const BIGINT = typeof BigUint64Array !== "undefined";
      const THIS = /* @__PURE__ */ Symbol();
      const STRING_SMALLSIZE = 192;
      const STRING_CHUNKSIZE = 1024;
      const utf16 = new TextDecoder("utf-16le", {
        fatal: true
      });
      Object.hasOwn = Object.hasOwn || function(obj, prop) {
        return Object.prototype.hasOwnProperty.call(obj, prop);
      };
      function getStringImpl(buffer, ptr) {
        let len = new Uint32Array(buffer)[ptr + SIZE_OFFSET >>> 2] >>> 1;
        const wtf16 = new Uint16Array(buffer, ptr, len);
        if (len <= STRING_SMALLSIZE) return String.fromCharCode(...wtf16);
        try {
          return utf16.decode(wtf16);
        } catch {
          let str = "", off = 0;
          while (len - off > STRING_CHUNKSIZE) {
            str += String.fromCharCode(...wtf16.subarray(off, off += STRING_CHUNKSIZE));
          }
          return str + String.fromCharCode(...wtf16.subarray(off));
        }
      }
      function preInstantiate(imports) {
        const extendedExports = {};
        function getString(memory, ptr) {
          if (!memory) return "<yet unknown>";
          return getStringImpl(memory.buffer, ptr);
        }
        const env = imports.env = imports.env || {};
        env.abort = env.abort || function abort(msg, file, line, colm) {
          const memory = extendedExports.memory || env.memory;
          throw Error(`abort: ${getString(memory, msg)} at ${getString(memory, file)}:${line}:${colm}`);
        };
        env.trace = env.trace || function trace(msg, n, ...args) {
          const memory = extendedExports.memory || env.memory;
          console.log(`trace: ${getString(memory, msg)}${n ? " " : ""}${args.slice(0, n).join(", ")}`);
        };
        env.seed = env.seed || Date.now;
        imports.Math = imports.Math || Math;
        imports.Date = imports.Date || Date;
        return extendedExports;
      }
      function postInstantiate(extendedExports, instance) {
        const exports4 = instance.exports;
        const memory = exports4.memory;
        const table = exports4.table;
        const __new = exports4.__new || F_NO_EXPORT_RUNTIME;
        const __pin = exports4.__pin || F_NO_EXPORT_RUNTIME;
        const __unpin = exports4.__unpin || F_NO_EXPORT_RUNTIME;
        const __collect = exports4.__collect || F_NO_EXPORT_RUNTIME;
        const __rtti_base = exports4.__rtti_base;
        const getRttiCount = __rtti_base ? (arr) => arr[__rtti_base >>> 2] : F_NO_EXPORT_RUNTIME;
        extendedExports.__new = __new;
        extendedExports.__pin = __pin;
        extendedExports.__unpin = __unpin;
        extendedExports.__collect = __collect;
        function getRttInfo(id) {
          const U32 = new Uint32Array(memory.buffer);
          if ((id >>>= 0) >= getRttiCount(U32)) throw Error(`invalid id: ${id}`);
          return U32[(__rtti_base + 4 >>> 2) + (id << 1)];
        }
        function getRttBase(id) {
          const U32 = new Uint32Array(memory.buffer);
          if ((id >>>= 0) >= getRttiCount(U32)) throw Error(`invalid id: ${id}`);
          return U32[(__rtti_base + 4 >>> 2) + (id << 1) + 1];
        }
        function getArrayInfo(id) {
          const info = getRttInfo(id);
          if (!(info & (ARRAYBUFFERVIEW | ARRAY | STATICARRAY))) throw Error(`not an array: ${id}, flags=${info}`);
          return info;
        }
        function getValueAlign(info) {
          return 31 - Math.clz32(info >>> VAL_ALIGN_OFFSET & 31);
        }
        function __newString(str) {
          if (str == null) return 0;
          const length = str.length;
          const ptr = __new(length << 1, STRING_ID);
          const U16 = new Uint16Array(memory.buffer);
          for (var i = 0, p = ptr >>> 1; i < length; ++i) U16[p + i] = str.charCodeAt(i);
          return ptr;
        }
        extendedExports.__newString = __newString;
        function __newArrayBuffer(buf) {
          if (buf == null) return 0;
          const bufview = new Uint8Array(buf);
          const ptr = __new(bufview.length, ARRAYBUFFER_ID);
          const U8 = new Uint8Array(memory.buffer);
          U8.set(bufview, ptr);
          return ptr;
        }
        extendedExports.__newArrayBuffer = __newArrayBuffer;
        function __getString(ptr) {
          if (!ptr) return null;
          const buffer = memory.buffer;
          const id = new Uint32Array(buffer)[ptr + ID_OFFSET >>> 2];
          if (id !== STRING_ID) throw Error(`not a string: ${ptr}`);
          return getStringImpl(buffer, ptr);
        }
        extendedExports.__getString = __getString;
        function getView(alignLog2, signed, float) {
          const buffer = memory.buffer;
          if (float) {
            switch (alignLog2) {
              case 2:
                return new Float32Array(buffer);
              case 3:
                return new Float64Array(buffer);
            }
          } else {
            switch (alignLog2) {
              case 0:
                return new (signed ? Int8Array : Uint8Array)(buffer);
              case 1:
                return new (signed ? Int16Array : Uint16Array)(buffer);
              case 2:
                return new (signed ? Int32Array : Uint32Array)(buffer);
              case 3:
                return new (signed ? BigInt64Array : BigUint64Array)(buffer);
            }
          }
          throw Error(`unsupported align: ${alignLog2}`);
        }
        function __newArray(id, valuesOrCapacity = 0) {
          const input = valuesOrCapacity;
          const info = getArrayInfo(id);
          const align = getValueAlign(info);
          const isArrayLike = typeof input !== "number";
          const length = isArrayLike ? input.length : input;
          const buf = __new(length << align, info & STATICARRAY ? id : ARRAYBUFFER_ID);
          let result;
          if (info & STATICARRAY) {
            result = buf;
          } else {
            __pin(buf);
            const arr = __new(info & ARRAY ? ARRAY_SIZE : ARRAYBUFFERVIEW_SIZE, id);
            __unpin(buf);
            const U32 = new Uint32Array(memory.buffer);
            U32[arr + ARRAYBUFFERVIEW_BUFFER_OFFSET >>> 2] = buf;
            U32[arr + ARRAYBUFFERVIEW_DATASTART_OFFSET >>> 2] = buf;
            U32[arr + ARRAYBUFFERVIEW_BYTELENGTH_OFFSET >>> 2] = length << align;
            if (info & ARRAY) U32[arr + ARRAY_LENGTH_OFFSET >>> 2] = length;
            result = arr;
          }
          if (isArrayLike) {
            const view = getView(align, info & VAL_SIGNED, info & VAL_FLOAT);
            const start2 = buf >>> align;
            if (info & VAL_MANAGED) {
              for (let i = 0; i < length; ++i) {
                view[start2 + i] = input[i];
              }
            } else {
              view.set(input, start2);
            }
          }
          return result;
        }
        extendedExports.__newArray = __newArray;
        function __getArrayView(arr) {
          const U32 = new Uint32Array(memory.buffer);
          const id = U32[arr + ID_OFFSET >>> 2];
          const info = getArrayInfo(id);
          const align = getValueAlign(info);
          let buf = info & STATICARRAY ? arr : U32[arr + ARRAYBUFFERVIEW_DATASTART_OFFSET >>> 2];
          const length = info & ARRAY ? U32[arr + ARRAY_LENGTH_OFFSET >>> 2] : U32[buf + SIZE_OFFSET >>> 2] >>> align;
          return getView(align, info & VAL_SIGNED, info & VAL_FLOAT).subarray(buf >>>= align, buf + length);
        }
        extendedExports.__getArrayView = __getArrayView;
        function __getArray(arr) {
          const input = __getArrayView(arr);
          const len = input.length;
          const out = new Array(len);
          for (let i = 0; i < len; i++) out[i] = input[i];
          return out;
        }
        extendedExports.__getArray = __getArray;
        function __getArrayBuffer(ptr) {
          const buffer = memory.buffer;
          const length = new Uint32Array(buffer)[ptr + SIZE_OFFSET >>> 2];
          return buffer.slice(ptr, ptr + length);
        }
        extendedExports.__getArrayBuffer = __getArrayBuffer;
        function __getFunction(ptr) {
          if (!table) throw Error(E_NO_EXPORT_TABLE);
          const index = new Uint32Array(memory.buffer)[ptr >>> 2];
          return table.get(index);
        }
        extendedExports.__getFunction = __getFunction;
        function getTypedArray(Type, alignLog2, ptr) {
          return new Type(getTypedArrayView(Type, alignLog2, ptr));
        }
        function getTypedArrayView(Type, alignLog2, ptr) {
          const buffer = memory.buffer;
          const U32 = new Uint32Array(buffer);
          return new Type(buffer, U32[ptr + ARRAYBUFFERVIEW_DATASTART_OFFSET >>> 2], U32[ptr + ARRAYBUFFERVIEW_BYTELENGTH_OFFSET >>> 2] >>> alignLog2);
        }
        function attachTypedArrayFunctions(ctor, name, align) {
          extendedExports[`__get${name}`] = getTypedArray.bind(null, ctor, align);
          extendedExports[`__get${name}View`] = getTypedArrayView.bind(null, ctor, align);
        }
        [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array].forEach((ctor) => {
          attachTypedArrayFunctions(ctor, ctor.name, 31 - Math.clz32(ctor.BYTES_PER_ELEMENT));
        });
        if (BIGINT) {
          [BigUint64Array, BigInt64Array].forEach((ctor) => {
            attachTypedArrayFunctions(ctor, ctor.name.slice(3), 3);
          });
        }
        function __instanceof(ptr, baseId) {
          const U32 = new Uint32Array(memory.buffer);
          let id = U32[ptr + ID_OFFSET >>> 2];
          if (id <= getRttiCount(U32)) {
            do {
              if (id == baseId) return true;
              id = getRttBase(id);
            } while (id);
          }
          return false;
        }
        extendedExports.__instanceof = __instanceof;
        extendedExports.memory = extendedExports.memory || memory;
        extendedExports.table = extendedExports.table || table;
        return demangle(exports4, extendedExports);
      }
      function isResponse(src) {
        return typeof Response !== "undefined" && src instanceof Response;
      }
      function isModule(src) {
        return src instanceof WebAssembly.Module;
      }
      async function instantiate(source, imports = {}) {
        if (isResponse(source = await source)) return instantiateStreaming(source, imports);
        const module3 = isModule(source) ? source : await WebAssembly.compile(source);
        const extended = preInstantiate(imports);
        const instance = await WebAssembly.instantiate(module3, imports);
        const exports4 = postInstantiate(extended, instance);
        return {
          module: module3,
          instance,
          exports: exports4
        };
      }
      function instantiateSync(source, imports = {}) {
        const module3 = isModule(source) ? source : new WebAssembly.Module(source);
        const extended = preInstantiate(imports);
        const instance = new WebAssembly.Instance(module3, imports);
        const exports4 = postInstantiate(extended, instance);
        return {
          module: module3,
          instance,
          exports: exports4
        };
      }
      async function instantiateStreaming(source, imports = {}) {
        if (!WebAssembly.instantiateStreaming) {
          return instantiate(isResponse(source = await source) ? source.arrayBuffer() : source, imports);
        }
        const extended = preInstantiate(imports);
        const result = await WebAssembly.instantiateStreaming(source, imports);
        const exports4 = postInstantiate(extended, result.instance);
        return {
          ...result,
          exports: exports4
        };
      }
      function demangle(exports4, extendedExports = {}) {
        const setArgumentsLength = exports4["__argumentsLength"] ? (length) => {
          exports4["__argumentsLength"].value = length;
        } : exports4["__setArgumentsLength"] || exports4["__setargc"] || (() => {
        });
        for (let internalName of Object.keys(exports4)) {
          const elem = exports4[internalName];
          let parts = internalName.split(".");
          let curr = extendedExports;
          while (parts.length > 1) {
            let part = parts.shift();
            if (!Object.hasOwn(curr, part)) curr[part] = {};
            curr = curr[part];
          }
          let name = parts[0];
          let hash = name.indexOf("#");
          if (hash >= 0) {
            const className = name.substring(0, hash);
            const classElem = curr[className];
            if (typeof classElem === "undefined" || !classElem.prototype) {
              const ctor = function(...args) {
                return ctor.wrap(ctor.prototype.constructor(0, ...args));
              };
              ctor.prototype = {
                valueOf() {
                  return this[THIS];
                }
              };
              ctor.wrap = function(thisValue) {
                return Object.create(ctor.prototype, {
                  [THIS]: {
                    value: thisValue,
                    writable: false
                  }
                });
              };
              if (classElem) Object.getOwnPropertyNames(classElem).forEach((name2) => Object.defineProperty(ctor, name2, Object.getOwnPropertyDescriptor(classElem, name2)));
              curr[className] = ctor;
            }
            name = name.substring(hash + 1);
            curr = curr[className].prototype;
            if (/^(get|set):/.test(name)) {
              if (!Object.hasOwn(curr, name = name.substring(4))) {
                let getter = exports4[internalName.replace("set:", "get:")];
                let setter = exports4[internalName.replace("get:", "set:")];
                Object.defineProperty(curr, name, {
                  get() {
                    return getter(this[THIS]);
                  },
                  set(value) {
                    setter(this[THIS], value);
                  },
                  enumerable: true
                });
              }
            } else {
              if (name === "constructor") {
                (curr[name] = function(...args) {
                  setArgumentsLength(args.length);
                  return elem(...args);
                }).original = elem;
              } else {
                (curr[name] = function(...args) {
                  setArgumentsLength(args.length);
                  return elem(this[THIS], ...args);
                }).original = elem;
              }
            }
          } else {
            if (/^(get|set):/.test(name)) {
              if (!Object.hasOwn(curr, name = name.substring(4))) {
                Object.defineProperty(curr, name, {
                  get: exports4[internalName.replace("set:", "get:")],
                  set: exports4[internalName.replace("get:", "set:")],
                  enumerable: true
                });
              }
            } else if (typeof elem === "function" && elem !== setArgumentsLength) {
              (curr[name] = (...args) => {
                setArgumentsLength(args.length);
                return elem(...args);
              }).original = elem;
            } else {
              curr[name] = elem;
            }
          }
        }
        return extendedExports;
      }
      var _default = {
        instantiate,
        instantiateSync,
        instantiateStreaming,
        demangle
      };
      exports3.default = _default;
      return "default" in exports3 ? exports3.default : exports3;
    })({});
    if (typeof define === "function" && define.amd) define([], function() {
      return loader;
    });
    else if (typeof module2 === "object" && typeof exports2 === "object") module2.exports = loader;
  }
});

// node_modules/hdr-histogram-js/dist/wasm/index.js
var require_wasm = __commonJS({
  "node_modules/hdr-histogram-js/dist/wasm/index.js"(exports2) {
    "use strict";
    var __awaiter = exports2 && exports2.__awaiter || function(thisArg, _arguments, P, generator) {
      function adopt(value) {
        return value instanceof P ? value : new P(function(resolve) {
          resolve(value);
        });
      }
      return new (P || (P = Promise))(function(resolve, reject) {
        function fulfilled(value) {
          try {
            step(generator.next(value));
          } catch (e) {
            reject(e);
          }
        }
        function rejected(value) {
          try {
            step(generator["throw"](value));
          } catch (e) {
            reject(e);
          }
        }
        function step(result) {
          result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
        }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
      });
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WasmHistogram = exports2.webAssemblyReady = exports2.initWebAssemblySync = exports2.initWebAssembly = exports2.webAssemblyAvailable = void 0;
    var generated_wasm_1 = require_generated_wasm();
    var Histogram_1 = require_Histogram();
    var base642 = require_base64_js();
    var pako2 = require_pako();
    var loader_1 = require_umd();
    var isNode = typeof process !== "undefined" && process.version;
    var isWorker = typeof importScripts === "function";
    exports2.webAssemblyAvailable = (() => {
      let available = false;
      if (isNode) {
        available = "WebAssembly" in global;
      } else {
        available = isWorker || "WebAssembly" in window;
      }
      return available;
    })();
    var wasm = void 0;
    var initWebAssembly = () => __awaiter(void 0, void 0, void 0, function* () {
      if (!exports2.webAssemblyAvailable) {
        throw new Error("WebAssembly not available here!");
      }
      if (!!wasm) {
        return;
      }
      return (0, loader_1.instantiate)(pako2.inflate(base642.toByteArray(generated_wasm_1.BINARY))).then((w) => wasm = w.exports || w);
    });
    exports2.initWebAssembly = initWebAssembly;
    var initWebAssemblySync = () => {
      if (!!wasm) {
        return;
      }
      const w = (0, loader_1.instantiateSync)(pako2.inflate(base642.toByteArray(generated_wasm_1.BINARY)));
      wasm = w.exports || w;
    };
    exports2.initWebAssemblySync = initWebAssemblySync;
    var webAssemblyReady = () => !!wasm;
    exports2.webAssemblyReady = webAssemblyReady;
    var defaultRequest = {
      bitBucketSize: 32,
      autoResize: true,
      lowestDiscernibleValue: 1,
      highestTrackableValue: 2,
      numberOfSignificantValueDigits: 3
    };
    var remoteHistogramClassFor = (size) => size === "packed" ? "PackedHistogram" : `Histogram${size}`;
    var destroyedWasmHistogram = new Proxy({}, {
      get: function(obj, prop) {
        throw new Error("Cannot use a destroyed histogram");
      }
    });
    var WasmHistogram = class _WasmHistogram {
      constructor(_wasmHistogram, _remoteHistogramClass) {
        this._wasmHistogram = _wasmHistogram;
        this._remoteHistogramClass = _remoteHistogramClass;
        this.tag = Histogram_1.NO_TAG;
        wasm.__pin(this._wasmHistogram);
      }
      static build(request = defaultRequest) {
        if (!(0, exports2.webAssemblyReady)()) {
          throw new Error("WebAssembly is not ready yet!");
        }
        const parameters = Object.assign({}, defaultRequest, request);
        const remoteHistogramClass = remoteHistogramClassFor(parameters.bitBucketSize);
        return new _WasmHistogram(new wasm[remoteHistogramClass](parameters.lowestDiscernibleValue, parameters.highestTrackableValue, parameters.numberOfSignificantValueDigits, parameters.autoResize), remoteHistogramClass);
      }
      static decode(data, bitBucketSize = 32, minBarForHighestTrackableValue = 0) {
        if (!(0, exports2.webAssemblyReady)()) {
          throw new Error("WebAssembly is not ready yet!");
        }
        const remoteHistogramClass = remoteHistogramClassFor(bitBucketSize);
        const decodeFunc = `decode${remoteHistogramClass}`;
        const ptrArr = wasm.__newArray(wasm.UINT8ARRAY_ID, data);
        const wasmHistogram = new _WasmHistogram(wasm[remoteHistogramClass].wrap(wasm[decodeFunc](ptrArr, minBarForHighestTrackableValue)), remoteHistogramClass);
        return wasmHistogram;
      }
      get numberOfSignificantValueDigits() {
        return this._wasmHistogram.numberOfSignificantValueDigits;
      }
      get autoResize() {
        return !!this._wasmHistogram.autoResize;
      }
      set autoResize(resize) {
        this._wasmHistogram.autoResize = resize;
      }
      get highestTrackableValue() {
        return this._wasmHistogram.highestTrackableValue;
      }
      set highestTrackableValue(value) {
        this._wasmHistogram.highestTrackableValue = value;
      }
      get startTimeStampMsec() {
        return this._wasmHistogram.startTimeStampMsec;
      }
      set startTimeStampMsec(value) {
        this._wasmHistogram.startTimeStampMsec = value;
      }
      get endTimeStampMsec() {
        return this._wasmHistogram.endTimeStampMsec;
      }
      set endTimeStampMsec(value) {
        this._wasmHistogram.endTimeStampMsec = value;
      }
      get totalCount() {
        return this._wasmHistogram.totalCount;
      }
      get stdDeviation() {
        return this._wasmHistogram.stdDeviation;
      }
      get mean() {
        return this._wasmHistogram.mean;
      }
      get estimatedFootprintInBytes() {
        return 192 + this._wasmHistogram.estimatedFootprintInBytes;
      }
      get minNonZeroValue() {
        return this._wasmHistogram.minNonZeroValue;
      }
      get maxValue() {
        return this._wasmHistogram.maxValue;
      }
      recordValue(value) {
        this._wasmHistogram.recordValue(value);
      }
      recordValueWithCount(value, count) {
        this._wasmHistogram.recordValueWithCount(value, count);
      }
      recordValueWithExpectedInterval(value, expectedIntervalBetweenValueSamples) {
        this._wasmHistogram.recordValueWithExpectedInterval(value, expectedIntervalBetweenValueSamples);
      }
      getValueAtPercentile(percentile) {
        return this._wasmHistogram.getValueAtPercentile(percentile);
      }
      outputPercentileDistribution(percentileTicksPerHalfDistance = 5, outputValueUnitScalingRatio = 1, useCsvFormat = false) {
        if (useCsvFormat) {
          throw new Error("CSV output not supported by wasm histograms");
        }
        return wasm.__getString(this._wasmHistogram.outputPercentileDistribution(percentileTicksPerHalfDistance, outputValueUnitScalingRatio));
      }
      isDestroyed() {
        return this._wasmHistogram === destroyedWasmHistogram;
      }
      get summary() {
        return (0, Histogram_1.toSummary)(this);
      }
      toJSON() {
        return this.summary;
      }
      toString() {
        if (this.isDestroyed()) {
          return "Destroyed WASM histogram";
        }
        return `WASM ${this._remoteHistogramClass} ${JSON.stringify(this, null, 2)}`;
      }
      inspect() {
        return this.toString();
      }
      [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")]() {
        return this.toString();
      }
      addWhileCorrectingForCoordinatedOmission(otherHistogram, expectedIntervalBetweenValueSamples) {
        this._wasmHistogram.addWhileCorrectingForCoordinatedOmission(otherHistogram, expectedIntervalBetweenValueSamples);
      }
      copyCorrectedForCoordinatedOmission(expectedIntervalBetweenValueSamples) {
        return new _WasmHistogram(wasm[this._remoteHistogramClass].wrap(this._wasmHistogram.copyCorrectedForCoordinatedOmission(expectedIntervalBetweenValueSamples)), this._remoteHistogramClass);
      }
      add(otherHistogram) {
        if (!(otherHistogram instanceof _WasmHistogram)) {
          throw new Error("Cannot add a regular JS histogram to a WASM histogram");
        }
        this._wasmHistogram[`add${otherHistogram._remoteHistogramClass}`](otherHistogram._wasmHistogram);
      }
      subtract(otherHistogram) {
        if (!(otherHistogram instanceof _WasmHistogram)) {
          throw new Error("Cannot subtract a regular JS histogram to a WASM histogram");
        }
        this._wasmHistogram[`subtract${otherHistogram._remoteHistogramClass}`](otherHistogram._wasmHistogram);
      }
      encode() {
        const ptrArray = wasm.__pin(this._wasmHistogram.encode());
        const array = wasm.__getUint8Array(ptrArray);
        wasm.__unpin(ptrArray);
        return array;
      }
      reset() {
        this.tag = Histogram_1.NO_TAG;
        this._wasmHistogram.reset();
      }
      destroy() {
        wasm.__unpin(this._wasmHistogram);
        this._wasmHistogram = destroyedWasmHistogram;
      }
    };
    exports2.WasmHistogram = WasmHistogram;
  }
});

// node_modules/hdr-histogram-js/dist/packedarray/PackedArrayContext.js
var require_PackedArrayContext = __commonJS({
  "node_modules/hdr-histogram-js/dist/packedarray/PackedArrayContext.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.PackedArrayContext = exports2.MINIMUM_INITIAL_PACKED_ARRAY_CAPACITY = void 0;
    exports2.MINIMUM_INITIAL_PACKED_ARRAY_CAPACITY = 16;
    var MAX_SUPPORTED_PACKED_COUNTS_ARRAY_LENGTH = Math.pow(2, 13) - 1;
    var SET_0_START_INDEX = 0;
    var NUMBER_OF_SETS = 8;
    var LEAF_LEVEL_SHIFT = 3;
    var NON_LEAF_ENTRY_SLOT_INDICATORS_OFFSET = 0;
    var NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS = 1;
    var PACKED_ARRAY_GROWTH_INCREMENT = 16;
    var PACKED_ARRAY_GROWTH_FRACTION_POW2 = 4;
    var { pow, ceil, log2, max: max2 } = Math;
    var bitCount = (n) => {
      var bits = 0;
      while (n !== 0) {
        bits += bitCount32(n | 0);
        n /= 4294967296;
      }
      return bits;
    };
    var bitCount32 = (n) => {
      n = n - (n >> 1 & 1431655765);
      n = (n & 858993459) + (n >> 2 & 858993459);
      return (n + (n >> 4) & 252645135) * 16843009 >> 24;
    };
    var PackedArrayContext = class _PackedArrayContext {
      constructor(virtualLength, initialPhysicalLength) {
        this.populatedShortLength = 0;
        this.topLevelShift = Number.MAX_VALUE;
        this.physicalLength = Math.max(initialPhysicalLength, exports2.MINIMUM_INITIAL_PACKED_ARRAY_CAPACITY);
        this.isPacked = this.physicalLength <= MAX_SUPPORTED_PACKED_COUNTS_ARRAY_LENGTH;
        if (!this.isPacked) {
          this.physicalLength = virtualLength;
        }
        this.array = new ArrayBuffer(this.physicalLength * 8);
        this.initArrayViews(this.array);
        this.init(virtualLength);
      }
      initArrayViews(array) {
        this.byteArray = new Uint8Array(array);
        this.shortArray = new Uint16Array(array);
        this.longArray = new Float64Array(array);
      }
      init(virtualLength) {
        if (!this.isPacked) {
          this.virtualLength = virtualLength;
          return;
        }
        this.populatedShortLength = SET_0_START_INDEX + 8;
        for (let i = 0; i < NUMBER_OF_SETS; i++) {
          this.setAtShortIndex(SET_0_START_INDEX + i, 0);
        }
        this.setVirtualLength(virtualLength);
      }
      clear() {
        this.byteArray.fill(0);
        this.init(this.virtualLength);
      }
      copyAndIncreaseSize(newPhysicalArrayLength, newVirtualArrayLength) {
        const ctx = new _PackedArrayContext(newVirtualArrayLength, newPhysicalArrayLength);
        if (this.isPacked) {
          ctx.populateEquivalentEntriesWithEntriesFromOther(this);
        }
        return ctx;
      }
      getPopulatedShortLength() {
        return this.populatedShortLength;
      }
      getPopulatedLongLength() {
        return this.getPopulatedShortLength() + 3 >> 2;
      }
      setAtByteIndex(byteIndex, value) {
        this.byteArray[byteIndex] = value;
      }
      getAtByteIndex(byteIndex) {
        return this.byteArray[byteIndex];
      }
      /**
       * add a byte value to a current byte value in the array
       * @param byteIndex index of byte value to add to
       * @param valueToAdd byte value to add
       * @return the afterAddValue. ((afterAddValue & 0x100) != 0) indicates a carry.
       */
      addAtByteIndex(byteIndex, valueToAdd) {
        const newValue = this.byteArray[byteIndex] + valueToAdd;
        this.byteArray[byteIndex] = newValue;
        return newValue;
      }
      setPopulatedLongLength(newPopulatedLongLength) {
        this.populatedShortLength = newPopulatedLongLength << 2;
      }
      getVirtualLength() {
        return this.virtualLength;
      }
      length() {
        return this.physicalLength;
      }
      setAtShortIndex(shortIndex, value) {
        this.shortArray[shortIndex] = value;
      }
      setAtLongIndex(longIndex, value) {
        this.longArray[longIndex] = value;
      }
      getAtShortIndex(shortIndex) {
        return this.shortArray[shortIndex];
      }
      getIndexAtShortIndex(shortIndex) {
        return this.shortArray[shortIndex];
      }
      setPackedSlotIndicators(entryIndex, newPackedSlotIndicators) {
        this.setAtShortIndex(entryIndex + NON_LEAF_ENTRY_SLOT_INDICATORS_OFFSET, newPackedSlotIndicators);
      }
      getPackedSlotIndicators(entryIndex) {
        return this.shortArray[entryIndex + NON_LEAF_ENTRY_SLOT_INDICATORS_OFFSET] & 65535;
      }
      getIndexAtEntrySlot(entryIndex, slot) {
        return this.getAtShortIndex(entryIndex + NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + slot);
      }
      setIndexAtEntrySlot(entryIndex, slot, newIndexValue) {
        this.setAtShortIndex(entryIndex + NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + slot, newIndexValue);
      }
      expandArrayIfNeeded(entryLengthInLongs) {
        const currentLength = this.length();
        if (currentLength < this.getPopulatedLongLength() + entryLengthInLongs) {
          const growthIncrement = max2(entryLengthInLongs, PACKED_ARRAY_GROWTH_INCREMENT, this.getPopulatedLongLength() >> PACKED_ARRAY_GROWTH_FRACTION_POW2);
          this.resizeArray(currentLength + growthIncrement);
        }
      }
      newEntry(entryLengthInShorts) {
        const newEntryIndex = this.populatedShortLength;
        this.expandArrayIfNeeded((entryLengthInShorts >> 2) + 1);
        this.populatedShortLength = newEntryIndex + entryLengthInShorts;
        for (let i = 0; i < entryLengthInShorts; i++) {
          this.setAtShortIndex(newEntryIndex + i, -1);
        }
        return newEntryIndex;
      }
      newLeafEntry() {
        let newEntryIndex;
        newEntryIndex = this.getPopulatedLongLength();
        this.expandArrayIfNeeded(1);
        this.setPopulatedLongLength(newEntryIndex + 1);
        this.setAtLongIndex(newEntryIndex, 0);
        return newEntryIndex;
      }
      /**
       * Consolidate entry with previous entry verison if one exists
       *
       * @param entryIndex The shortIndex of the entry to be consolidated
       * @param previousVersionIndex the index of the previous version of the entry
       */
      consolidateEntry(entryIndex, previousVersionIndex) {
        const previousVersionPackedSlotsIndicators = this.getPackedSlotIndicators(previousVersionIndex);
        const packedSlotsIndicators = this.getPackedSlotIndicators(entryIndex);
        const insertedSlotMask = packedSlotsIndicators ^ previousVersionPackedSlotsIndicators;
        const slotsBelowBitNumber = packedSlotsIndicators & insertedSlotMask - 1;
        const insertedSlotIndex = bitCount(slotsBelowBitNumber);
        const numberOfSlotsInEntry = bitCount(packedSlotsIndicators);
        let sourceSlot = 0;
        for (let targetSlot = 0; targetSlot < numberOfSlotsInEntry; targetSlot++) {
          if (targetSlot !== insertedSlotIndex) {
            const indexAtSlot = this.getIndexAtEntrySlot(previousVersionIndex, sourceSlot);
            if (indexAtSlot !== 0) {
              this.setIndexAtEntrySlot(entryIndex, targetSlot, indexAtSlot);
            }
            sourceSlot++;
          }
        }
      }
      /**
       * Expand entry as indicated.
       *
       * @param existingEntryIndex the index of the entry
       * @param entryPointerIndex  index to the slot pointing to the entry (needs to be fixed up)
       * @param insertedSlotIndex  realtive [packed] index of slot being inserted into entry
       * @param insertedSlotMask   mask value fo slot being inserted
       * @param nextLevelIsLeaf    the level below this one is a leaf level
       * @return the updated index of the entry (-1 if epansion failed due to conflict)
       * @throws RetryException if expansion fails due to concurrent conflict, and caller should try again.
       */
      expandEntry(existingEntryIndex, entryPointerIndex, insertedSlotIndex, insertedSlotMask, nextLevelIsLeaf) {
        let packedSlotIndicators = this.getAtShortIndex(existingEntryIndex) & 65535;
        packedSlotIndicators |= insertedSlotMask;
        const numberOfslotsInExpandedEntry = bitCount(packedSlotIndicators);
        if (insertedSlotIndex >= numberOfslotsInExpandedEntry) {
          throw new Error("inserted slot index is out of range given provided masks");
        }
        const expandedEntryLength = numberOfslotsInExpandedEntry + NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS;
        let indexOfNewNextLevelEntry = 0;
        if (nextLevelIsLeaf) {
          indexOfNewNextLevelEntry = this.newLeafEntry();
        } else {
          indexOfNewNextLevelEntry = this.newEntry(NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS);
          this.setPackedSlotIndicators(indexOfNewNextLevelEntry, 0);
        }
        const insertedSlotValue = indexOfNewNextLevelEntry;
        const expandedEntryIndex = this.newEntry(expandedEntryLength);
        this.setPackedSlotIndicators(expandedEntryIndex, packedSlotIndicators);
        this.setIndexAtEntrySlot(expandedEntryIndex, insertedSlotIndex, insertedSlotValue);
        this.setAtShortIndex(entryPointerIndex, expandedEntryIndex);
        this.consolidateEntry(expandedEntryIndex, existingEntryIndex);
        return expandedEntryIndex;
      }
      //
      //   ######   ######## ########    ##     ##    ###    ##             ## #### ##    ## ########  ######## ##     ##
      //  ##    ##  ##          ##       ##     ##   ## ##   ##            ##   ##  ###   ## ##     ## ##        ##   ##
      //  ##        ##          ##       ##     ##  ##   ##  ##           ##    ##  ####  ## ##     ## ##         ## ##
      //  ##   #### ######      ##       ##     ## ##     ## ##          ##     ##  ## ## ## ##     ## ######      ###
      //  ##    ##  ##          ##        ##   ##  ######### ##         ##      ##  ##  #### ##     ## ##         ## ##
      //  ##    ##  ##          ##         ## ##   ##     ## ##        ##       ##  ##   ### ##     ## ##        ##   ##
      //   ######   ########    ##          ###    ##     ## ######## ##       #### ##    ## ########  ######## ##     ##
      //
      getRootEntry(setNumber, insertAsNeeded = false) {
        const entryPointerIndex = SET_0_START_INDEX + setNumber;
        let entryIndex = this.getIndexAtShortIndex(entryPointerIndex);
        if (entryIndex == 0) {
          if (!insertAsNeeded) {
            return 0;
          }
          entryIndex = this.newEntry(NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS);
          this.setPackedSlotIndicators(entryIndex, 0);
          this.setAtShortIndex(entryPointerIndex, entryIndex);
        }
        return entryIndex;
      }
      /**
       * Get the byte-index (into the packed array) corresponding to a given (set tree) value byte of given virtual index.
       * Inserts new set tree nodes as needed if indicated.
       *
       * @param setNumber      The set tree number (0-7, 0 corresponding with the LSByte set tree)
       * @param virtualIndex   The virtual index into the PackedArray
       * @param insertAsNeeded If true, will insert new set tree nodes as needed if they do not already exist
       * @return the byte-index corresponding to the given (set tree) value byte of the given virtual index
       */
      getPackedIndex(setNumber, virtualIndex, insertAsNeeded) {
        if (virtualIndex >= this.virtualLength) {
          throw new Error(`Attempting access at index ${virtualIndex}, beyond virtualLength ${this.virtualLength}`);
        }
        let entryPointerIndex = SET_0_START_INDEX + setNumber;
        let entryIndex = this.getRootEntry(setNumber, insertAsNeeded);
        if (entryIndex == 0) {
          return -1;
        }
        for (let indexShift = this.topLevelShift; indexShift >= LEAF_LEVEL_SHIFT; indexShift -= 4) {
          const nextLevelIsLeaf = indexShift === LEAF_LEVEL_SHIFT;
          const packedSlotIndicators = this.getPackedSlotIndicators(entryIndex);
          const slotBitNumber = virtualIndex / pow(2, indexShift) & 15;
          const slotMask = 1 << slotBitNumber;
          const slotsBelowBitNumber = packedSlotIndicators & slotMask - 1;
          const slotNumber = bitCount(slotsBelowBitNumber);
          if ((packedSlotIndicators & slotMask) === 0) {
            if (!insertAsNeeded) {
              return -1;
            }
            entryIndex = this.expandEntry(entryIndex, entryPointerIndex, slotNumber, slotMask, nextLevelIsLeaf);
          }
          entryPointerIndex = entryIndex + NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + slotNumber;
          entryIndex = this.getIndexAtShortIndex(entryPointerIndex);
        }
        const byteIndex = (entryIndex << 3) + (virtualIndex & 7);
        return byteIndex;
      }
      determineTopLevelShiftForVirtualLength(virtualLength) {
        const sizeMagnitude = ceil(log2(virtualLength));
        const eightsSizeMagnitude = sizeMagnitude - 3;
        let multipleOfFourSizeMagnitude = ceil(eightsSizeMagnitude / 4) * 4;
        multipleOfFourSizeMagnitude = max2(multipleOfFourSizeMagnitude, 8);
        const topLevelShiftNeeded = multipleOfFourSizeMagnitude - 4 + 3;
        return topLevelShiftNeeded;
      }
      setVirtualLength(virtualLength) {
        if (!this.isPacked) {
          throw new Error("Should never be adjusting the virtual size of a non-packed context");
        }
        this.topLevelShift = this.determineTopLevelShiftForVirtualLength(virtualLength);
        this.virtualLength = virtualLength;
      }
      getTopLevelShift() {
        return this.topLevelShift;
      }
      //
      //  ##     ##         ########   #######  ########  ##     ## ##          ###    ######## ########
      //   ##   ##          ##     ## ##     ## ##     ## ##     ## ##         ## ##      ##    ##
      //    ## ##           ##     ## ##     ## ##     ## ##     ## ##        ##   ##     ##    ##
      //     ###    ####### ########  ##     ## ########  ##     ## ##       ##     ##    ##    ######
      //    ## ##           ##        ##     ## ##        ##     ## ##       #########    ##    ##
      //   ##   ##          ##        ##     ## ##        ##     ## ##       ##     ##    ##    ##
      //  ##     ##         ##         #######  ##         #######  ######## ##     ##    ##    ########
      //
      resizeArray(newLength) {
        const tmp = new Uint8Array(newLength * 8);
        tmp.set(this.byteArray);
        this.array = tmp.buffer;
        this.initArrayViews(this.array);
        this.physicalLength = newLength;
      }
      populateEquivalentEntriesWithEntriesFromOther(other) {
        if (this.virtualLength < other.getVirtualLength()) {
          throw new Error("Cannot populate array of smaller virtual length");
        }
        for (let i = 0; i < NUMBER_OF_SETS; i++) {
          const otherEntryIndex = other.getAtShortIndex(SET_0_START_INDEX + i);
          if (otherEntryIndex == 0)
            continue;
          let entryIndexPointer = SET_0_START_INDEX + i;
          for (let i2 = this.topLevelShift; i2 > other.topLevelShift; i2 -= 4) {
            const sizeOfEntry = NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + 1;
            const newEntryIndex = this.newEntry(sizeOfEntry);
            this.setAtShortIndex(entryIndexPointer, newEntryIndex);
            this.setPackedSlotIndicators(newEntryIndex, 1);
            entryIndexPointer = newEntryIndex + NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS;
          }
          this.copyEntriesAtLevelFromOther(other, otherEntryIndex, entryIndexPointer, other.topLevelShift);
        }
      }
      copyEntriesAtLevelFromOther(other, otherLevelEntryIndex, levelEntryIndexPointer, otherIndexShift) {
        const nextLevelIsLeaf = otherIndexShift == LEAF_LEVEL_SHIFT;
        const packedSlotIndicators = other.getPackedSlotIndicators(otherLevelEntryIndex);
        const numberOfSlots = bitCount(packedSlotIndicators);
        const sizeOfEntry = NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + numberOfSlots;
        const entryIndex = this.newEntry(sizeOfEntry);
        this.setAtShortIndex(levelEntryIndexPointer, entryIndex);
        this.setAtShortIndex(entryIndex + NON_LEAF_ENTRY_SLOT_INDICATORS_OFFSET, packedSlotIndicators);
        for (let i = 0; i < numberOfSlots; i++) {
          if (nextLevelIsLeaf) {
            const leafEntryIndex = this.newLeafEntry();
            this.setIndexAtEntrySlot(entryIndex, i, leafEntryIndex);
            const otherNextLevelEntryIndex = other.getIndexAtEntrySlot(otherLevelEntryIndex, i);
            this.longArray[leafEntryIndex] = other.longArray[otherNextLevelEntryIndex];
          } else {
            const otherNextLevelEntryIndex = other.getIndexAtEntrySlot(otherLevelEntryIndex, i);
            this.copyEntriesAtLevelFromOther(other, otherNextLevelEntryIndex, entryIndex + NON_LEAF_ENTRY_HEADER_SIZE_IN_SHORTS + i, otherIndexShift - 4);
          }
        }
      }
      getAtUnpackedIndex(index) {
        return this.longArray[index];
      }
      setAtUnpackedIndex(index, newValue) {
        this.longArray[index] = newValue;
      }
      lazysetAtUnpackedIndex(index, newValue) {
        this.longArray[index] = newValue;
      }
      incrementAndGetAtUnpackedIndex(index) {
        this.longArray[index]++;
        return this.longArray[index];
      }
      addAndGetAtUnpackedIndex(index, valueToAdd) {
        this.longArray[index] += valueToAdd;
        return this.longArray[index];
      }
      //
      //   ########  #######           ######  ######## ########  #### ##    ##  ######
      //      ##    ##     ##         ##    ##    ##    ##     ##  ##  ###   ## ##    ##
      //      ##    ##     ##         ##          ##    ##     ##  ##  ####  ## ##
      //      ##    ##     ## #######  ######     ##    ########   ##  ## ## ## ##   ####
      //      ##    ##     ##               ##    ##    ##   ##    ##  ##  #### ##    ##
      //      ##    ##     ##         ##    ##    ##    ##    ##   ##  ##   ### ##    ##
      //      ##     #######           ######     ##    ##     ## #### ##    ##  ######
      //
      nonLeafEntryToString(entryIndex, indexShift, indentLevel) {
        let output = "";
        for (let i = 0; i < indentLevel; i++) {
          output += "  ";
        }
        try {
          const packedSlotIndicators = this.getPackedSlotIndicators(entryIndex);
          output += `slotIndiators: 0x${toHex(packedSlotIndicators)}, prevVersionIndex: 0: [ `;
          const numberOfslotsInEntry = bitCount(packedSlotIndicators);
          for (let i = 0; i < numberOfslotsInEntry; i++) {
            output += this.getIndexAtEntrySlot(entryIndex, i);
            if (i < numberOfslotsInEntry - 1) {
              output += ", ";
            }
          }
          output += ` ] (indexShift = ${indexShift})
`;
          const nextLevelIsLeaf = indexShift == LEAF_LEVEL_SHIFT;
          for (let i = 0; i < numberOfslotsInEntry; i++) {
            const nextLevelEntryIndex = this.getIndexAtEntrySlot(entryIndex, i);
            if (nextLevelIsLeaf) {
              output += this.leafEntryToString(nextLevelEntryIndex, indentLevel + 4);
            } else {
              output += this.nonLeafEntryToString(nextLevelEntryIndex, indexShift - 4, indentLevel + 4);
            }
          }
        } catch (ex) {
          output += `Exception thrown at nonLeafEnty at index ${entryIndex} with indexShift ${indexShift}
`;
        }
        return output;
      }
      leafEntryToString(entryIndex, indentLevel) {
        let output = "";
        for (let i = 0; i < indentLevel; i++) {
          output += "  ";
        }
        try {
          output += "Leaf bytes : ";
          for (let i = 0; i < 8; i++) {
            output += `0x${toHex(this.byteArray[entryIndex * 8 + i])} `;
          }
          output += "\n";
        } catch (ex) {
          output += `Exception thrown at leafEnty at index ${entryIndex}
`;
        }
        return output;
      }
      toString() {
        let output = "PackedArrayContext:\n";
        if (!this.isPacked) {
          return output + "Context is unpacked:\n";
        }
        for (let setNumber = 0; setNumber < NUMBER_OF_SETS; setNumber++) {
          try {
            const entryPointerIndex = SET_0_START_INDEX + setNumber;
            const entryIndex = this.getIndexAtShortIndex(entryPointerIndex);
            output += `Set ${setNumber}: root = ${entryIndex} 
`;
            if (entryIndex == 0)
              continue;
            output += this.nonLeafEntryToString(entryIndex, this.topLevelShift, 4);
          } catch (ex) {
            output += `Exception thrown in set ${setNumber}%d
`;
          }
        }
        return output;
      }
    };
    exports2.PackedArrayContext = PackedArrayContext;
    var toHex = (n) => {
      return Number(n).toString(16).padStart(2, "0");
    };
  }
});

// node_modules/hdr-histogram-js/dist/packedarray/PackedArray.js
var require_PackedArray = __commonJS({
  "node_modules/hdr-histogram-js/dist/packedarray/PackedArray.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.PackedArray = void 0;
    var PackedArrayContext_1 = require_PackedArrayContext();
    var NUMBER_OF_SETS = 8;
    var { pow, floor } = Math;
    var PackedArray = class {
      constructor(virtualLength, initialPhysicalLength = PackedArrayContext_1.MINIMUM_INITIAL_PACKED_ARRAY_CAPACITY) {
        this.arrayContext = new PackedArrayContext_1.PackedArrayContext(virtualLength, initialPhysicalLength);
      }
      setVirtualLength(newVirtualArrayLength) {
        if (newVirtualArrayLength < this.length()) {
          throw new Error("Cannot set virtual length, as requested length " + newVirtualArrayLength + " is smaller than the current virtual length " + this.length());
        }
        const currentArrayContext = this.arrayContext;
        if (currentArrayContext.isPacked && currentArrayContext.determineTopLevelShiftForVirtualLength(newVirtualArrayLength) == currentArrayContext.getTopLevelShift()) {
          currentArrayContext.setVirtualLength(newVirtualArrayLength);
          return;
        }
        this.arrayContext = currentArrayContext.copyAndIncreaseSize(this.getPhysicalLength(), newVirtualArrayLength);
      }
      /**
       * Get value at virtual index in the array
       * @param index the virtual array index
       * @return the array value at the virtual index given
       */
      get(index) {
        let value = 0;
        for (let byteNum = 0; byteNum < NUMBER_OF_SETS; byteNum++) {
          let byteValueAtPackedIndex = 0;
          if (!this.arrayContext.isPacked) {
            return this.arrayContext.getAtUnpackedIndex(index);
          }
          const packedIndex = this.arrayContext.getPackedIndex(byteNum, index, false);
          if (packedIndex < 0) {
            return value;
          }
          byteValueAtPackedIndex = this.arrayContext.getAtByteIndex(packedIndex) * pow(2, byteNum << 3);
          value += byteValueAtPackedIndex;
        }
        return value;
      }
      /**
       * Increment value at a virrual index in the array
       * @param index virtual index of value to increment
       */
      increment(index) {
        this.add(index, 1);
      }
      safeGetPackedIndexgetPackedIndex(setNumber, virtualIndex) {
        return this.arrayContext.getPackedIndex(setNumber, virtualIndex, true);
      }
      /**
       * Add to a value at a virtual index in the array
       * @param index the virtual index of the value to be added to
       * @param value the value to add
       */
      add(index, value) {
        let remainingValueToAdd = value;
        for (let byteNum = 0, byteShift = 0; byteNum < NUMBER_OF_SETS; byteNum++, byteShift += 8) {
          if (!this.arrayContext.isPacked) {
            this.arrayContext.addAndGetAtUnpackedIndex(index, value);
            return;
          }
          const packedIndex = this.safeGetPackedIndexgetPackedIndex(byteNum, index);
          const byteToAdd = remainingValueToAdd & 255;
          const afterAddByteValue = this.arrayContext.addAtByteIndex(packedIndex, byteToAdd);
          remainingValueToAdd -= byteToAdd;
          remainingValueToAdd = remainingValueToAdd / pow(2, 8);
          remainingValueToAdd += floor(afterAddByteValue / pow(2, 8));
          if (remainingValueToAdd == 0) {
            return;
          }
        }
      }
      /**
       * Set the value at a virtual index in the array
       * @param index the virtual index of the value to set
       * @param value the value to set
       */
      set(index, value) {
        let bytesAlreadySet = 0;
        let valueForNextLevels = value;
        for (let byteNum = 0; byteNum < NUMBER_OF_SETS; byteNum++) {
          if (!this.arrayContext.isPacked) {
            this.arrayContext.setAtUnpackedIndex(index, value);
            return;
          }
          if (valueForNextLevels == 0) {
            const packedIndex2 = this.arrayContext.getPackedIndex(byteNum, index, false);
            if (packedIndex2 < 0) {
              return;
            }
          }
          const packedIndex = this.arrayContext.getPackedIndex(byteNum, index, true);
          const byteToWrite = valueForNextLevels & 255;
          valueForNextLevels = floor(valueForNextLevels / pow(2, 8));
          if (byteNum < bytesAlreadySet) {
            continue;
          }
          this.arrayContext.setAtByteIndex(packedIndex, byteToWrite);
          bytesAlreadySet++;
        }
      }
      /**
       * Get the current physical length (in longs) of the array's backing storage
       * @return the current physical length (in longs) of the array's current backing storage
       */
      getPhysicalLength() {
        return this.arrayContext.physicalLength;
      }
      /**
       * Get the (virtual) length of the array
       * @return the (virtual) length of the array
       */
      length() {
        return this.arrayContext.getVirtualLength();
      }
      /**
       * Clear the array contents
       */
      clear() {
        this.arrayContext.clear();
      }
      toString() {
        let output = "PackedArray:\n";
        output += this.arrayContext.toString();
        return output;
      }
    };
    exports2.PackedArray = PackedArray;
  }
});

// node_modules/hdr-histogram-js/dist/PackedHistogram.js
var require_PackedHistogram = __commonJS({
  "node_modules/hdr-histogram-js/dist/PackedHistogram.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var JsHistogram_12 = require_JsHistogram();
    var PackedArray_1 = require_PackedArray();
    var PackedHistogram = class _PackedHistogram extends JsHistogram_12.default {
      constructor(lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits) {
        super(lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits);
        this._totalCount = 0;
        this.packedCounts = new PackedArray_1.PackedArray(this.countsArrayLength);
      }
      clearCounts() {
        this.packedCounts.clear();
      }
      incrementCountAtIndex(index) {
        this.packedCounts.increment(index);
      }
      addToCountAtIndex(index, value) {
        this.packedCounts.add(index, value);
      }
      setCountAtIndex(index, value) {
        this.packedCounts.set(index, value);
      }
      resize(newHighestTrackableValue) {
        this.establishSize(newHighestTrackableValue);
        this.packedCounts.setVirtualLength(this.countsArrayLength);
      }
      getCountAtIndex(index) {
        return this.packedCounts.get(index);
      }
      _getEstimatedFootprintInBytes() {
        return 192 + 8 * this.packedCounts.getPhysicalLength();
      }
      copyCorrectedForCoordinatedOmission(expectedIntervalBetweenValueSamples) {
        const copy = new _PackedHistogram(this.lowestDiscernibleValue, this.highestTrackableValue, this.numberOfSignificantValueDigits);
        copy.addWhileCorrectingForCoordinatedOmission(this, expectedIntervalBetweenValueSamples);
        return copy;
      }
      toString() {
        return `PackedHistogram ${JSON.stringify(this, null, 2)}`;
      }
    };
    exports2.default = PackedHistogram;
  }
});

// node_modules/hdr-histogram-js/dist/TypedArrayHistogram.js
var require_TypedArrayHistogram = __commonJS({
  "node_modules/hdr-histogram-js/dist/TypedArrayHistogram.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var JsHistogram_12 = require_JsHistogram();
    var TypedArrayHistogram = class _TypedArrayHistogram extends JsHistogram_12.default {
      constructor(arrayCtr, lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits) {
        super(lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits);
        this.arrayCtr = arrayCtr;
        this._totalCount = 0;
        this._counts = new arrayCtr(this.countsArrayLength);
      }
      clearCounts() {
        this._counts.fill(0);
      }
      incrementCountAtIndex(index) {
        const currentCount = this._counts[index];
        const newCount = currentCount + 1;
        if (newCount < 0) {
          throw newCount + " would overflow short integer count";
        }
        this._counts[index] = newCount;
      }
      addToCountAtIndex(index, value) {
        const currentCount = this._counts[index];
        const newCount = currentCount + value;
        if (newCount < Number.MIN_SAFE_INTEGER || newCount > Number.MAX_SAFE_INTEGER) {
          throw newCount + " would overflow integer count";
        }
        this._counts[index] = newCount;
      }
      setCountAtIndex(index, value) {
        if (value < Number.MIN_SAFE_INTEGER || value > Number.MAX_SAFE_INTEGER) {
          throw value + " would overflow integer count";
        }
        this._counts[index] = value;
      }
      resize(newHighestTrackableValue) {
        this.establishSize(newHighestTrackableValue);
        const newCounts = new this.arrayCtr(this.countsArrayLength);
        newCounts.set(this._counts);
        this._counts = newCounts;
      }
      getCountAtIndex(index) {
        return this._counts[index];
      }
      _getEstimatedFootprintInBytes() {
        return 1024 + this._counts.BYTES_PER_ELEMENT * this._counts.length;
      }
      copyCorrectedForCoordinatedOmission(expectedIntervalBetweenValueSamples) {
        const copy = new _TypedArrayHistogram(this.arrayCtr, this.lowestDiscernibleValue, this.highestTrackableValue, this.numberOfSignificantValueDigits);
        copy.addWhileCorrectingForCoordinatedOmission(this, expectedIntervalBetweenValueSamples);
        return copy;
      }
      toString() {
        return `Histogram ${this._counts.BYTES_PER_ELEMENT * 8}b ${JSON.stringify(this, null, 2)}`;
      }
    };
    exports2.default = TypedArrayHistogram;
  }
});

// node_modules/hdr-histogram-js/dist/Int8Histogram.js
var require_Int8Histogram = __commonJS({
  "node_modules/hdr-histogram-js/dist/Int8Histogram.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var TypedArrayHistogram_1 = require_TypedArrayHistogram();
    var Int8Histogram = class extends TypedArrayHistogram_1.default {
      constructor(lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits) {
        super(Uint8Array, lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits);
      }
    };
    exports2.default = Int8Histogram;
  }
});

// node_modules/hdr-histogram-js/dist/Int16Histogram.js
var require_Int16Histogram = __commonJS({
  "node_modules/hdr-histogram-js/dist/Int16Histogram.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var TypedArrayHistogram_1 = require_TypedArrayHistogram();
    var Int16Histogram = class extends TypedArrayHistogram_1.default {
      constructor(lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits) {
        super(Uint16Array, lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits);
      }
    };
    exports2.default = Int16Histogram;
  }
});

// node_modules/hdr-histogram-js/dist/Int32Histogram.js
var require_Int32Histogram = __commonJS({
  "node_modules/hdr-histogram-js/dist/Int32Histogram.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var TypedArrayHistogram_1 = require_TypedArrayHistogram();
    var Int32Histogram = class extends TypedArrayHistogram_1.default {
      constructor(lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits) {
        super(Uint32Array, lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits);
      }
    };
    exports2.default = Int32Histogram;
  }
});

// node_modules/hdr-histogram-js/dist/Float64Histogram.js
var require_Float64Histogram = __commonJS({
  "node_modules/hdr-histogram-js/dist/Float64Histogram.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var TypedArrayHistogram_1 = require_TypedArrayHistogram();
    var Float64Histogram = class extends TypedArrayHistogram_1.default {
      constructor(lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits) {
        super(Float64Array, lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits);
      }
    };
    exports2.default = Float64Histogram;
  }
});

// node_modules/hdr-histogram-js/dist/JsHistogramFactory.js
var require_JsHistogramFactory = __commonJS({
  "node_modules/hdr-histogram-js/dist/JsHistogramFactory.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.constructorFromBucketSize = constructorFromBucketSize;
    var PackedHistogram_1 = require_PackedHistogram();
    var Int8Histogram_1 = require_Int8Histogram();
    var Int16Histogram_1 = require_Int16Histogram();
    var Int32Histogram_1 = require_Int32Histogram();
    var Float64Histogram_1 = require_Float64Histogram();
    function constructorFromBucketSize(bitBucketSize) {
      switch (bitBucketSize) {
        case "packed":
          return PackedHistogram_1.default;
        case 8:
          return Int8Histogram_1.default;
        case 16:
          return Int16Histogram_1.default;
        case 32:
          return Int32Histogram_1.default;
        case 64:
          return Float64Histogram_1.default;
        default:
          throw new Error("Incorrect parameter bitBucketSize");
      }
    }
  }
});

// node_modules/hdr-histogram-js/dist/ZigZagEncoding.js
var require_ZigZagEncoding = __commonJS({
  "node_modules/hdr-histogram-js/dist/ZigZagEncoding.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var { pow, floor } = Math;
    var TWO_POW_7 = pow(2, 7);
    var TWO_POW_14 = pow(2, 14);
    var TWO_POW_21 = pow(2, 21);
    var TWO_POW_28 = pow(2, 28);
    var TWO_POW_35 = pow(2, 35);
    var TWO_POW_42 = pow(2, 42);
    var TWO_POW_49 = pow(2, 49);
    var TWO_POW_56 = pow(2, 56);
    var ZigZagEncoding = class {
      /**
       * Writes a long value to the given buffer in LEB128 ZigZag encoded format
       * (negative numbers not supported)
       * @param buffer the buffer to write to
       * @param value  the value to write to the buffer
       */
      static encode(buffer, value) {
        if (value >= 0) {
          value = value * 2;
        } else {
          value = -value * 2 - 1;
        }
        if (value < TWO_POW_7) {
          buffer.put(value);
        } else {
          buffer.put(value | 128);
          if (value < TWO_POW_14) {
            buffer.put(floor(value / TWO_POW_7));
          } else {
            buffer.put(floor(value / TWO_POW_7) | 128);
            if (value < TWO_POW_21) {
              buffer.put(floor(value / TWO_POW_14));
            } else {
              buffer.put(floor(value / TWO_POW_14) | 128);
              if (value < TWO_POW_28) {
                buffer.put(floor(value / TWO_POW_21));
              } else {
                buffer.put(floor(value / TWO_POW_21) | 128);
                if (value < TWO_POW_35) {
                  buffer.put(floor(value / TWO_POW_28));
                } else {
                  buffer.put(floor(value / TWO_POW_28) | 128);
                  if (value < TWO_POW_42) {
                    buffer.put(floor(value / TWO_POW_35));
                  } else {
                    buffer.put(floor(value / TWO_POW_35) | 128);
                    if (value < TWO_POW_49) {
                      buffer.put(floor(value / TWO_POW_42));
                    } else {
                      buffer.put(floor(value / TWO_POW_42) | 128);
                      if (value < TWO_POW_56) {
                        buffer.put(floor(value / TWO_POW_49));
                      } else {
                        buffer.put(floor(value / TWO_POW_49) + 128);
                        buffer.put(floor(value / TWO_POW_56));
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      /**
       * Read an LEB128-64b9B ZigZag encoded long value from the given buffer
       * (negative numbers not supported)
       * @param buffer the buffer to read from
       * @return the value read from the buffer
       */
      static decode(buffer) {
        let v = buffer.get();
        let value = v & 127;
        if ((v & 128) != 0) {
          v = buffer.get();
          value += (v & 127) * TWO_POW_7;
          if ((v & 128) != 0) {
            v = buffer.get();
            value += (v & 127) * TWO_POW_14;
            if ((v & 128) != 0) {
              v = buffer.get();
              value += (v & 127) * TWO_POW_21;
              if ((v & 128) != 0) {
                v = buffer.get();
                value += (v & 127) * TWO_POW_28;
                if ((v & 128) != 0) {
                  v = buffer.get();
                  value += (v & 127) * TWO_POW_35;
                  if ((v & 128) != 0) {
                    v = buffer.get();
                    value += (v & 127) * TWO_POW_42;
                    if ((v & 128) != 0) {
                      v = buffer.get();
                      value += (v & 127) * TWO_POW_49;
                      if ((v & 128) != 0) {
                        v = buffer.get();
                        value += (v & 127) * TWO_POW_56;
                      }
                    }
                  }
                }
              }
            }
          }
        }
        if (value % 2 === 0) {
          value = value / 2;
        } else {
          value = -(value + 1) / 2;
        }
        return value;
      }
    };
    exports2.default = ZigZagEncoding;
  }
});

// node_modules/hdr-histogram-js/dist/JsHistogram.encoding.js
var require_JsHistogram_encoding = __commonJS({
  "node_modules/hdr-histogram-js/dist/JsHistogram.encoding.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.inflate = exports.deflate = void 0;
    exports.decompress = decompress;
    exports.doDecode = doDecode;
    var base64 = require_base64_js();
    var pako = require_pako();
    var JsHistogram_1 = require_JsHistogram();
    var ByteBuffer_1 = require_ByteBuffer();
    var JsHistogramFactory_1 = require_JsHistogramFactory();
    var ZigZagEncoding_1 = require_ZigZagEncoding();
    var { max } = Math;
    var V2EncodingCookieBase = 478450435;
    var V2CompressedEncodingCookieBase = 478450436;
    var V2maxWordSizeInBytes = 9;
    var encodingCookie = V2EncodingCookieBase | 16;
    var compressedEncodingCookie = V2CompressedEncodingCookieBase | 16;
    function fillBufferFromCountsArray(self2, buffer) {
      const countsLimit = self2.countsArrayIndex(self2.maxValue) + 1;
      let srcIndex = 0;
      while (srcIndex < countsLimit) {
        const count = self2.getCountAtIndex(srcIndex++);
        if (count < 0) {
          throw new Error("Cannot encode histogram containing negative counts (" + count + ") at index " + srcIndex + ", corresponding the value range [" + self2.lowestEquivalentValue(self2.valueFromIndex(srcIndex)) + "," + self2.nextNonEquivalentValue(self2.valueFromIndex(srcIndex)) + ")");
        }
        let zerosCount = 0;
        if (count == 0) {
          zerosCount = 1;
          while (srcIndex < countsLimit && self2.getCountAtIndex(srcIndex) == 0) {
            zerosCount++;
            srcIndex++;
          }
        }
        if (zerosCount > 1) {
          ZigZagEncoding_1.default.encode(buffer, -zerosCount);
        } else {
          ZigZagEncoding_1.default.encode(buffer, count);
        }
      }
    }
    function encodeIntoByteBuffer(self2, buffer) {
      const initialPosition = buffer.position;
      buffer.putInt32(encodingCookie);
      buffer.putInt32(0);
      buffer.putInt32(1);
      buffer.putInt32(self2.numberOfSignificantValueDigits);
      buffer.putInt64(self2.lowestDiscernibleValue);
      buffer.putInt64(self2.highestTrackableValue);
      buffer.putInt64(1);
      const payloadStartPosition = buffer.position;
      fillBufferFromCountsArray(self2, buffer);
      const backupIndex = buffer.position;
      buffer.position = initialPosition + 4;
      buffer.putInt32(backupIndex - payloadStartPosition);
      buffer.position = backupIndex;
      return backupIndex - initialPosition;
    }
    function fillCountsArrayFromSourceBuffer(self2, sourceBuffer, lengthInBytes, wordSizeInBytes) {
      if (wordSizeInBytes != 2 && wordSizeInBytes != 4 && wordSizeInBytes != 8 && wordSizeInBytes != V2maxWordSizeInBytes) {
        throw new Error("word size must be 2, 4, 8, or V2maxWordSizeInBytes (" + V2maxWordSizeInBytes + ") bytes");
      }
      let dstIndex = 0;
      const endPosition = sourceBuffer.position + lengthInBytes;
      while (sourceBuffer.position < endPosition) {
        let zerosCount = 0;
        let count = ZigZagEncoding_1.default.decode(sourceBuffer);
        if (count < 0) {
          zerosCount = -count;
          dstIndex += zerosCount;
        } else {
          self2.setCountAtIndex(dstIndex++, count);
        }
      }
      return dstIndex;
    }
    function getCookieBase(cookie) {
      return cookie & ~240;
    }
    function getWordSizeInBytesFromCookie(cookie) {
      if (getCookieBase(cookie) == V2EncodingCookieBase || getCookieBase(cookie) == V2CompressedEncodingCookieBase) {
        return V2maxWordSizeInBytes;
      }
      const sizeByte = (cookie & 240) >> 4;
      return sizeByte & 14;
    }
    function findDeflateFunction() {
      try {
        return eval('require("zlib").deflateSync');
      } catch (error) {
        return !!pako ? pako.deflate : () => {
          throw new Error("pako library is mandatory for encoding/deconding on the browser side");
        };
      }
    }
    function findInflateFunction() {
      try {
        return eval('require("zlib").inflateSync');
      } catch (error) {
        return !!pako ? pako.inflate : () => {
          throw new Error("pako library is mandatory for encoding/deconding on the browser side");
        };
      }
    }
    exports.deflate = findDeflateFunction();
    exports.inflate = findInflateFunction();
    function decompress(data) {
      const buffer = new ByteBuffer_1.default(data);
      const initialTargetPosition = buffer.position;
      const cookie = buffer.getInt32();
      if ((cookie & ~240) !== V2CompressedEncodingCookieBase) {
        throw new Error("Encoding not supported, only V2 is supported");
      }
      const lengthOfCompressedContents = buffer.getInt32();
      const uncompressedBuffer = (0, exports.inflate)(buffer.data.slice(initialTargetPosition + 8, initialTargetPosition + 8 + lengthOfCompressedContents));
      return uncompressedBuffer;
    }
    function doDecode(data, bitBucketSize = 32, minBarForHighestTrackableValue = 0) {
      const buffer = new ByteBuffer_1.default(data);
      const cookie = buffer.getInt32();
      let payloadLengthInBytes;
      let numberOfSignificantValueDigits;
      let lowestTrackableUnitValue;
      let highestTrackableValue;
      if (getCookieBase(cookie) === V2EncodingCookieBase) {
        if (getWordSizeInBytesFromCookie(cookie) != V2maxWordSizeInBytes) {
          throw new Error("The buffer does not contain a Histogram (no valid cookie found)");
        }
        payloadLengthInBytes = buffer.getInt32();
        buffer.getInt32();
        numberOfSignificantValueDigits = buffer.getInt32();
        lowestTrackableUnitValue = buffer.getInt64();
        highestTrackableValue = buffer.getInt64();
        buffer.getInt64();
      } else {
        throw new Error("The buffer does not contain a Histogram (no valid V2 encoding cookie found)");
      }
      highestTrackableValue = max(highestTrackableValue, minBarForHighestTrackableValue);
      const histogramConstr = (0, JsHistogramFactory_1.constructorFromBucketSize)(bitBucketSize);
      const histogram = new histogramConstr(lowestTrackableUnitValue, highestTrackableValue, numberOfSignificantValueDigits);
      const filledLength = fillCountsArrayFromSourceBuffer(histogram, buffer, payloadLengthInBytes, V2maxWordSizeInBytes);
      histogram.establishInternalTackingValues(filledLength);
      return histogram;
    }
    function doEncodeIntoCompressedBase64(compressionLevel) {
      const compressionOptions = compressionLevel ? { level: compressionLevel } : {};
      const self2 = this;
      const targetBuffer = ByteBuffer_1.default.allocate();
      targetBuffer.putInt32(compressedEncodingCookie);
      const intermediateUncompressedByteBuffer = ByteBuffer_1.default.allocate();
      const uncompressedLength = encodeIntoByteBuffer(self2, intermediateUncompressedByteBuffer);
      const data = intermediateUncompressedByteBuffer.data.slice(0, uncompressedLength);
      const compressedData = (0, exports.deflate)(data, compressionOptions);
      targetBuffer.putInt32(compressedData.byteLength);
      targetBuffer.putArray(compressedData);
      return base64.fromByteArray(targetBuffer.data);
    }
    JsHistogram_1.JsHistogram.decode = doDecode;
    JsHistogram_1.JsHistogram.prototype.encodeIntoCompressedBase64 = doEncodeIntoCompressedBase64;
  }
});

// node_modules/hdr-histogram-js/dist/encoding.js
var require_encoding = __commonJS({
  "node_modules/hdr-histogram-js/dist/encoding.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.encodeIntoCompressedBase64 = exports2.decodeFromCompressedBase64 = void 0;
    exports2.decompress = decompress2;
    var JsHistogram_12 = require_JsHistogram();
    var ByteBuffer_12 = require_ByteBuffer();
    var wasm_1 = require_wasm();
    var base642 = require_base64_js();
    var JsHistogram_encoding_1 = require_JsHistogram_encoding();
    var V2CompressedEncodingCookieBase2 = 478450436;
    var compressedEncodingCookie2 = V2CompressedEncodingCookieBase2 | 16;
    function decompress2(data) {
      const buffer = new ByteBuffer_12.default(data);
      const initialTargetPosition = buffer.position;
      const cookie = buffer.getInt32();
      if ((cookie & ~240) !== V2CompressedEncodingCookieBase2) {
        throw new Error("Encoding not supported, only V2 is supported");
      }
      const lengthOfCompressedContents = buffer.getInt32();
      const uncompressedBuffer = (0, JsHistogram_encoding_1.inflate)(buffer.data.slice(initialTargetPosition + 8, initialTargetPosition + 8 + lengthOfCompressedContents));
      return uncompressedBuffer;
    }
    var decodeFromCompressedBase64 = (base64String, bitBucketSize = 32, useWebAssembly = false, minBarForHighestTrackableValue = 0) => {
      const data = base642.toByteArray(base64String.trim());
      const uncompressedData = decompress2(data);
      if (useWebAssembly) {
        return wasm_1.WasmHistogram.decode(uncompressedData, bitBucketSize, minBarForHighestTrackableValue);
      }
      return JsHistogram_12.JsHistogram.decode(uncompressedData, bitBucketSize, minBarForHighestTrackableValue);
    };
    exports2.decodeFromCompressedBase64 = decodeFromCompressedBase64;
    function encodeWasmIntoCompressedBase64(compressionLevel) {
      const compressionOptions = compressionLevel ? { level: compressionLevel } : {};
      const self2 = this;
      const targetBuffer = ByteBuffer_12.default.allocate();
      targetBuffer.putInt32(compressedEncodingCookie2);
      const uncompressedData = self2.encode();
      const compressedData = (0, JsHistogram_encoding_1.deflate)(uncompressedData, compressionOptions);
      targetBuffer.putInt32(compressedData.byteLength);
      targetBuffer.putArray(compressedData);
      return base642.fromByteArray(targetBuffer.data);
    }
    wasm_1.WasmHistogram.prototype.encodeIntoCompressedBase64 = encodeWasmIntoCompressedBase64;
    var encodeIntoCompressedBase64 = (histogram, compressionLevel) => {
      if (histogram instanceof wasm_1.WasmHistogram) {
        return histogram.encodeIntoCompressedBase64(compressionLevel);
      }
      if (histogram instanceof JsHistogram_12.JsHistogram) {
        return histogram.encodeIntoCompressedBase64(compressionLevel);
      }
      throw new Error("Unsupported Histogram implementation");
    };
    exports2.encodeIntoCompressedBase64 = encodeIntoCompressedBase64;
  }
});

// node_modules/hdr-histogram-js/dist/HistogramLogReader.js
var require_HistogramLogReader = __commonJS({
  "node_modules/hdr-histogram-js/dist/HistogramLogReader.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.listTags = void 0;
    var Histogram_1 = require_Histogram();
    var encoding_1 = require_encoding();
    var TAG_PREFIX = "Tag=";
    var TAG_PREFIX_LENGTH = "Tag=".length;
    var HistogramLogReader = class {
      constructor(logContent, bitBucketSize = 32, useWebAssembly = false) {
        this.lines = splitLines(logContent);
        this.currentLineIndex = 0;
        this.bitBucketSize = bitBucketSize;
        this.useWebAssembly = useWebAssembly;
      }
      /**
       * Read the next interval histogram from the log. Returns a Histogram object if
       * an interval line was found, or null if not.
       * <p>Upon encountering any unexpected format errors in reading the next interval
       * from the file, this method will return a null.
       * @return a DecodedInterval, or a null if no appropriate interval found
       */
      nextIntervalHistogram(rangeStartTimeSec = 0, rangeEndTimeSec = Number.MAX_VALUE) {
        while (this.currentLineIndex < this.lines.length) {
          const currentLine = this.lines[this.currentLineIndex];
          this.currentLineIndex++;
          if (currentLine.startsWith("#[StartTime:")) {
            this.parseStartTimeFromLine(currentLine);
          } else if (currentLine.startsWith("#[BaseTime:")) {
            this.parseBaseTimeFromLine(currentLine);
          } else if (currentLine.startsWith("#") || currentLine.startsWith('"StartTimestamp"')) {
          } else if (currentLine.includes(",")) {
            const tokens = currentLine.split(",");
            const [firstToken] = tokens;
            let tag;
            if (firstToken.startsWith(TAG_PREFIX)) {
              tag = firstToken.substring(TAG_PREFIX_LENGTH);
              tokens.shift();
            } else {
              tag = Histogram_1.NO_TAG;
            }
            const [rawLogTimeStampInSec, rawIntervalLengthSec, , base64Histogram] = tokens;
            const logTimeStampInSec = Number.parseFloat(rawLogTimeStampInSec);
            if (!this.baseTimeSec) {
              if (logTimeStampInSec < this.startTimeSec - 365 * 24 * 3600) {
                this.baseTimeSec = this.startTimeSec;
              } else {
                this.baseTimeSec = 0;
              }
            }
            if (rangeEndTimeSec < logTimeStampInSec) {
              return null;
            }
            if (logTimeStampInSec < rangeStartTimeSec) {
              continue;
            }
            const histogram = (0, encoding_1.decodeFromCompressedBase64)(base64Histogram, this.bitBucketSize, this.useWebAssembly);
            histogram.startTimeStampMsec = (this.baseTimeSec + logTimeStampInSec) * 1e3;
            const intervalLengthSec = Number.parseFloat(rawIntervalLengthSec);
            histogram.endTimeStampMsec = (this.baseTimeSec + logTimeStampInSec + intervalLengthSec) * 1e3;
            histogram.tag = tag;
            return histogram;
          }
        }
        return null;
      }
      parseStartTimeFromLine(line) {
        this.startTimeSec = Number.parseFloat(line.split(" ")[1]);
      }
      parseBaseTimeFromLine(line) {
        this.baseTimeSec = Number.parseFloat(line.split(" ")[1]);
      }
    };
    var splitLines = (logContent) => logContent.split(/\r\n|\r|\n/g);
    var shouldIncludeNoTag = (lines) => lines.find((line) => !line.startsWith("#") && !line.startsWith('"') && !line.startsWith(TAG_PREFIX) && line.includes(","));
    var listTags = (content) => {
      const lines = splitLines(content);
      const tags = lines.filter((line) => line.includes(",") && line.startsWith(TAG_PREFIX)).map((line) => line.substring(TAG_PREFIX_LENGTH, line.indexOf(",")));
      const tagsWithoutDuplicates = new Set(tags);
      const result = Array.from(tagsWithoutDuplicates);
      if (shouldIncludeNoTag(lines)) {
        result.unshift("NO TAG");
      }
      return result;
    };
    exports2.listTags = listTags;
    exports2.default = HistogramLogReader;
  }
});

// node_modules/hdr-histogram-js/dist/HistogramLogWriter.js
var require_HistogramLogWriter = __commonJS({
  "node_modules/hdr-histogram-js/dist/HistogramLogWriter.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var Histogram_1 = require_Histogram();
    var encoding_1 = require_encoding();
    var formatters_1 = require_formatters();
    var HISTOGRAM_LOG_FORMAT_VERSION = "1.3";
    var timeFormatter = (0, formatters_1.floatFormatter)(5, 3);
    var HistogramLogWriter = class {
      constructor(log) {
        this.log = log;
        this.baseTime = 0;
      }
      /**
       * Output an interval histogram, with the given timestamp information and the [optional] tag
       * associated with the histogram, using a configurable maxValueUnitRatio. (note that the
       * specified timestamp information will be used, and the timestamp information in the actual
       * histogram will be ignored).
       * The max value reported with the interval line will be scaled by the given maxValueUnitRatio.
       * @param startTimeStampSec The start timestamp to log with the interval histogram, in seconds.
       * @param endTimeStampSec The end timestamp to log with the interval histogram, in seconds.
       * @param histogram The interval histogram to log.
       * @param maxValueUnitRatio The ratio by which to divide the histogram's max value when reporting on it.
       */
      outputIntervalHistogram(histogram, startTimeStampSec = (histogram.startTimeStampMsec - this.baseTime) / 1e3, endTimeStampSec = (histogram.endTimeStampMsec - this.baseTime) / 1e3, maxValueUnitRatio = 1e3) {
        const base642 = (0, encoding_1.encodeIntoCompressedBase64)(histogram);
        const start2 = timeFormatter(startTimeStampSec);
        const duration = timeFormatter(endTimeStampSec - startTimeStampSec);
        const max2 = timeFormatter(histogram.maxValue / maxValueUnitRatio);
        const lineContent = `${start2},${duration},${max2},${base642}
`;
        if (histogram.tag && histogram.tag !== Histogram_1.NO_TAG) {
          this.log(`Tag=${histogram.tag},${lineContent}`);
        } else {
          this.log(lineContent);
        }
      }
      /**
       * Log a comment to the log.
       * Comments will be preceded with with the '#' character.
       * @param comment the comment string.
       */
      outputComment(comment) {
        this.log(`#${comment}
`);
      }
      /**
       * Log a start time in the log.
       * @param startTimeMsec time (in milliseconds) since the absolute start time (the epoch)
       */
      outputStartTime(startTimeMsec) {
        this.outputComment(`[StartTime: ${(0, formatters_1.floatFormatter)(5, 3)(startTimeMsec / 1e3)} (seconds since epoch), ${new Date(startTimeMsec)}]
`);
      }
      /**
       * Output a legend line to the log.
       */
      outputLegend() {
        this.log('"StartTimestamp","Interval_Length","Interval_Max","Interval_Compressed_Histogram"\n');
      }
      /**
       * Output a log format version to the log.
       */
      outputLogFormatVersion() {
        this.outputComment("[Histogram log format version " + HISTOGRAM_LOG_FORMAT_VERSION + "]");
      }
    };
    exports2.default = HistogramLogWriter;
  }
});

// node_modules/hdr-histogram-js/dist/HistogramBuilder.js
var require_HistogramBuilder = __commonJS({
  "node_modules/hdr-histogram-js/dist/HistogramBuilder.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.build = exports2.defaultRequest = void 0;
    var JsHistogramFactory_12 = require_JsHistogramFactory();
    var wasm_1 = require_wasm();
    exports2.defaultRequest = {
      bitBucketSize: 32,
      autoResize: true,
      lowestDiscernibleValue: 1,
      highestTrackableValue: 2,
      numberOfSignificantValueDigits: 3,
      useWebAssembly: false
    };
    var build = (request = exports2.defaultRequest) => {
      const parameters = Object.assign({}, exports2.defaultRequest, request);
      if (request.useWebAssembly && wasm_1.webAssemblyAvailable) {
        return wasm_1.WasmHistogram.build(parameters);
      }
      const histogramConstr = (0, JsHistogramFactory_12.constructorFromBucketSize)(parameters.bitBucketSize);
      const histogram = new histogramConstr(parameters.lowestDiscernibleValue, parameters.highestTrackableValue, parameters.numberOfSignificantValueDigits);
      histogram.autoResize = parameters.autoResize;
      return histogram;
    };
    exports2.build = build;
  }
});

// node_modules/hdr-histogram-js/dist/Recorder.js
var require_Recorder = __commonJS({
  "node_modules/hdr-histogram-js/dist/Recorder.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var HistogramBuilder_1 = require_HistogramBuilder();
    var Recorder = class _Recorder {
      /**
       * Construct an auto-resizing {@link Recorder} with a lowest discernible value of
       * 1 and an auto-adjusting highestTrackableValue. Can auto-resize up to track values up to Number.MAX_SAFE_INTEGER.
       *
       * @param histogramBuildRequest parameters used to build histograms while using this recorder.
       * @param clock (for testing purpose) an action that give current time in ms since 1970
       */
      constructor(histogramBuildRequest = HistogramBuilder_1.defaultRequest, clock = () => (/* @__PURE__ */ new Date()).getTime()) {
        this.histogramBuildRequest = histogramBuildRequest;
        this.clock = clock;
        this.activeHistogram = (0, HistogramBuilder_1.build)(this.histogramBuildRequest);
        _Recorder.idGenerator++;
        this.activeHistogram.containingInstanceId = _Recorder.idGenerator;
        this.activeHistogram.startTimeStampMsec = clock();
      }
      /**
       * Record a value in the histogram
       *
       * @param value The value to be recorded
       * @throws may throw Error if value is exceeds highestTrackableValue
       */
      recordValue(value) {
        this.activeHistogram.recordValue(value);
      }
      /**
       * Record a value in the histogram (adding to the value's current count)
       *
       * @param value The value to be recorded
       * @param count The number of occurrences of this value to record
       * @throws ArrayIndexOutOfBoundsException (may throw) if value is exceeds highestTrackableValue
       */
      recordValueWithCount(value, count) {
        this.activeHistogram.recordValueWithCount(value, count);
      }
      /**
       * Record a value
       * <p>
       * To compensate for the loss of sampled values when a recorded value is larger than the expected
       * interval between value samples, Histogram will auto-generate an additional series of decreasingly-smaller
       * (down to the expectedIntervalBetweenValueSamples) value records.
       * <p>
       * See related notes {@link Histogram#recordValueWithExpectedInterval(long, long)}
       * for more explanations about coordinated omission and expected interval correction.
       *      *
       * @param value The value to record
       * @param expectedIntervalBetweenValueSamples If expectedIntervalBetweenValueSamples is larger than 0, add
       *                                           auto-generated value records as appropriate if value is larger
       *                                           than expectedIntervalBetweenValueSamples
       * @throws ArrayIndexOutOfBoundsException (may throw) if value is exceeds highestTrackableValue
       */
      recordValueWithExpectedInterval(value, expectedIntervalBetweenValueSamples) {
        this.activeHistogram.recordValueWithExpectedInterval(value, expectedIntervalBetweenValueSamples);
      }
      /**
       * Get an interval histogram, which will include a stable, consistent view of all value counts
       * accumulated since the last interval histogram was taken.
       * <p>
       * {@link Recorder#getIntervalHistogram(Histogram histogramToRecycle)
       * getIntervalHistogram(histogramToRecycle)}
       * accepts a previously returned interval histogram that can be recycled internally to avoid allocation
       * and content copying operations, and is therefore significantly more efficient for repeated use than
       * {@link Recorder#getIntervalHistogram()} and
       * {@link Recorder#getIntervalHistogramInto getIntervalHistogramInto()}. The provided
       * {@code histogramToRecycle} must
       * be either be null or an interval histogram returned by a previous call to
       * {@link Recorder#getIntervalHistogram(Histogram histogramToRecycle)
       * getIntervalHistogram(histogramToRecycle)} or
       * {@link Recorder#getIntervalHistogram()}.
       * <p>
       * NOTE: The caller is responsible for not recycling the same returned interval histogram more than once. If
       * the same interval histogram instance is recycled more than once, behavior is undefined.
       * <p>
       * Calling {@link Recorder#getIntervalHistogram(Histogram histogramToRecycle)
       * getIntervalHistogram(histogramToRecycle)} will reset the value counts, and start accumulating value
       * counts for the next interval
       *
       * @param histogramToRecycle a previously returned interval histogram that may be recycled to avoid allocation and
       *                           copy operations.
       * @return a histogram containing the value counts accumulated since the last interval histogram was taken.
       */
      getIntervalHistogram(histogramToRecycle) {
        if (histogramToRecycle) {
          const histogramToRecycleWithId = histogramToRecycle;
          if (histogramToRecycleWithId.containingInstanceId !== this.activeHistogram.containingInstanceId) {
            throw "replacement histogram must have been obtained via a previous getIntervalHistogram() call from this Recorder";
          }
        }
        this.inactiveHistogram = histogramToRecycle;
        this.performIntervalSample();
        const sampledHistogram = this.inactiveHistogram;
        this.inactiveHistogram = null;
        return sampledHistogram;
      }
      /**
       * Place a copy of the value counts accumulated since accumulated (since the last interval histogram
       * was taken) into {@code targetHistogram}.
       *
       * Calling {@link Recorder#getIntervalHistogramInto getIntervalHistogramInto()} will reset
       * the value counts, and start accumulating value counts for the next interval.
       *
       * @param targetHistogram the histogram into which the interval histogram's data should be copied
       */
      getIntervalHistogramInto(targetHistogram) {
        this.performIntervalSample();
        if (this.inactiveHistogram) {
          targetHistogram.add(this.inactiveHistogram);
          targetHistogram.startTimeStampMsec = this.inactiveHistogram.startTimeStampMsec;
          targetHistogram.endTimeStampMsec = this.inactiveHistogram.endTimeStampMsec;
        }
      }
      /**
       * Reset any value counts accumulated thus far.
       */
      reset() {
        this.activeHistogram.reset();
        this.activeHistogram.startTimeStampMsec = this.clock();
      }
      performIntervalSample() {
        if (!this.inactiveHistogram) {
          this.inactiveHistogram = (0, HistogramBuilder_1.build)(this.histogramBuildRequest);
          this.inactiveHistogram.containingInstanceId = this.activeHistogram.containingInstanceId;
        }
        this.inactiveHistogram.reset();
        const tempHistogram = this.activeHistogram;
        this.activeHistogram = this.inactiveHistogram;
        this.inactiveHistogram = tempHistogram;
        const currentTimeInMs = this.clock();
        this.inactiveHistogram.endTimeStampMsec = currentTimeInMs;
        this.activeHistogram.startTimeStampMsec = currentTimeInMs;
      }
      /**
       * Release memory associated to this recorder by destroying
       * histograms used under the cover.
       * Useful when webassembly histograms are used.
       */
      destroy() {
        var _a;
        this.activeHistogram.destroy();
        (_a = this.inactiveHistogram) === null || _a === void 0 ? void 0 : _a.destroy();
      }
    };
    Recorder.idGenerator = 0;
    exports2.default = Recorder;
  }
});

// node_modules/hdr-histogram-js/dist/index.js
var require_dist2 = __commonJS({
  "node_modules/hdr-histogram-js/dist/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.JsHistogram = exports2.WasmHistogram = exports2.Recorder = exports2.HistogramLogWriter = exports2.encodeIntoCompressedBase64 = exports2.decodeFromCompressedBase64 = exports2.ByteBuffer = exports2.build = exports2.listTags = exports2.HistogramLogReader = exports2.PackedHistogram = exports2.Float64Histogram = exports2.Int32Histogram = exports2.Int16Histogram = exports2.Int8Histogram = exports2.initWebAssemblySync = exports2.initWebAssembly = void 0;
    var ByteBuffer_12 = require_ByteBuffer();
    exports2.ByteBuffer = ByteBuffer_12.default;
    var encoding_1 = require_encoding();
    Object.defineProperty(exports2, "decodeFromCompressedBase64", { enumerable: true, get: function() {
      return encoding_1.decodeFromCompressedBase64;
    } });
    Object.defineProperty(exports2, "encodeIntoCompressedBase64", { enumerable: true, get: function() {
      return encoding_1.encodeIntoCompressedBase64;
    } });
    var Float64Histogram_1 = require_Float64Histogram();
    exports2.Float64Histogram = Float64Histogram_1.default;
    var HistogramLogReader_1 = require_HistogramLogReader();
    exports2.HistogramLogReader = HistogramLogReader_1.default;
    Object.defineProperty(exports2, "listTags", { enumerable: true, get: function() {
      return HistogramLogReader_1.listTags;
    } });
    var HistogramLogWriter_1 = require_HistogramLogWriter();
    exports2.HistogramLogWriter = HistogramLogWriter_1.default;
    var Int16Histogram_1 = require_Int16Histogram();
    exports2.Int16Histogram = Int16Histogram_1.default;
    var Int32Histogram_1 = require_Int32Histogram();
    exports2.Int32Histogram = Int32Histogram_1.default;
    var Int8Histogram_1 = require_Int8Histogram();
    exports2.Int8Histogram = Int8Histogram_1.default;
    var JsHistogram_12 = require_JsHistogram();
    exports2.JsHistogram = JsHistogram_12.default;
    var PackedHistogram_1 = require_PackedHistogram();
    exports2.PackedHistogram = PackedHistogram_1.default;
    var Recorder_1 = require_Recorder();
    exports2.Recorder = Recorder_1.default;
    var wasm_1 = require_wasm();
    Object.defineProperty(exports2, "initWebAssembly", { enumerable: true, get: function() {
      return wasm_1.initWebAssembly;
    } });
    Object.defineProperty(exports2, "initWebAssemblySync", { enumerable: true, get: function() {
      return wasm_1.initWebAssemblySync;
    } });
    Object.defineProperty(exports2, "WasmHistogram", { enumerable: true, get: function() {
      return wasm_1.WasmHistogram;
    } });
    var HistogramBuilder_1 = require_HistogramBuilder();
    Object.defineProperty(exports2, "build", { enumerable: true, get: function() {
      return HistogramBuilder_1.build;
    } });
  }
});

// node_modules/hdr-histogram-percentiles-obj/index.js
var require_hdr_histogram_percentiles_obj = __commonJS({
  "node_modules/hdr-histogram-percentiles-obj/index.js"(exports2, module2) {
    "use strict";
    var percentiles = module2.exports.percentiles = [
      1e-3,
      0.01,
      0.1,
      1,
      2.5,
      10,
      25,
      50,
      75,
      90,
      97.5,
      99,
      99.9,
      99.99,
      99.999
    ];
    module2.exports.histAsObj = function(hist, total) {
      const mean = Math.ceil(getMean(hist) * 100) / 100;
      const result = {
        average: mean,
        // added for backward compat with wrk
        mean,
        stddev: Math.ceil(getStdDeviation(hist) * 100) / 100,
        min: getMin(hist),
        max: getMax(hist)
      };
      if (typeof total === "number") {
        result.total = total;
      }
      return result;
    };
    module2.exports.addPercentiles = function(hist, result) {
      percentiles.forEach(function(perc) {
        const key = ("p" + perc).replace(".", "_");
        if (typeof hist.percentile === "function") {
          result[key] = hist.percentile(perc);
        } else if (typeof hist.getValueAtPercentile === "function") {
          result[key] = hist.getValueAtPercentile(perc);
        }
      });
      return result;
    };
    function getMean(hist) {
      if (typeof hist.mean === "function") {
        return hist.mean();
      }
      if (typeof hist.getMean === "function") {
        return hist.getMean();
      }
      return hist.mean;
    }
    function getMin(hist) {
      if (typeof hist.min === "function") {
        return hist.min();
      }
      return hist.minNonZeroValue;
    }
    function getMax(hist) {
      if (typeof hist.max === "function") {
        return hist.max();
      }
      return hist.maxValue;
    }
    function getStdDeviation(hist) {
      if (typeof hist.stddev === "function") {
        return hist.stddev();
      }
      if (typeof hist.getStdDeviation === "function") {
        return hist.getStdDeviation();
      }
      return hist.stdDeviation;
    }
  }
});

// node_modules/autocannon/lib/histUtil.js
var require_histUtil = __commonJS({
  "node_modules/autocannon/lib/histUtil.js"(exports2) {
    var hdr = require_dist2();
    var histUtil = require_hdr_histogram_percentiles_obj();
    hdr.initWebAssemblySync();
    var getHistograms = ({
      latencies = hdr.build({
        useWebAssembly: true,
        bitBucketSize: 64,
        autoResize: true,
        lowestDiscernibleValue: 1,
        highestTrackableValue: 1e4,
        numberOfSignificantValueDigits: 5
      }),
      requests = hdr.build({
        useWebAssembly: true,
        bitBucketSize: 64,
        autoResize: true,
        lowestDiscernibleValue: 1,
        highestTrackableValue: 1e6,
        numberOfSignificantValueDigits: 3
      }),
      throughput = hdr.build({
        useWebAssembly: true,
        bitBucketSize: 64,
        autoResize: true,
        lowestDiscernibleValue: 1,
        highestTrackableValue: 1e11,
        numberOfSignificantValueDigits: 3
      })
    } = {}) => ({
      latencies,
      requests,
      throughput
    });
    function encodeHist(h) {
      if (h.__custom) return null;
      return hdr.encodeIntoCompressedBase64(h);
    }
    function decodeHist(str) {
      if (!str) return null;
      return hdr.decodeFromCompressedBase64(str);
    }
    exports2.getHistograms = getHistograms;
    exports2.encodeHist = encodeHist;
    exports2.decodeHist = decodeHist;
    exports2.histAsObj = histUtil.histAsObj;
    exports2.addPercentiles = histUtil.addPercentiles;
    exports2.percentiles = histUtil.percentiles;
  }
});

// node_modules/autocannon/lib/format.js
var require_format = __commonJS({
  "node_modules/autocannon/lib/format.js"(exports2, module2) {
    "use strict";
    function format(num) {
      if (num < 1e3) {
        return "" + num;
      } else {
        return "" + Math.round(num / 1e3) + "k";
      }
    }
    module2.exports = format;
  }
});

// node_modules/autocannon/lib/printResult.js
var require_printResult = __commonJS({
  "node_modules/autocannon/lib/printResult.js"(exports2, module2) {
    "use strict";
    var Table = require_cli_table3();
    var Chalk = require_source();
    var testColorSupport = require_color_support();
    var prettyBytes = require_pretty_bytes();
    var { percentiles } = require_histUtil();
    var format = require_format();
    var defaults2 = {
      // use stderr as its progressBar's default
      outputStream: process.stderr,
      renderResultsTable: true,
      renderLatencyTable: false,
      verbose: true
    };
    var printResult2 = (result, opts) => {
      opts = Object.assign({}, defaults2, opts);
      let strResult = "";
      if (opts.verbose) {
        const chalk = new Chalk.Instance(testColorSupport({ stream: opts.outputStream, alwaysReturn: true }));
        const shortLatency = new Table({
          head: asColor(chalk.cyan, ["Stat", "2.5%", "50%", "97.5%", "99%", "Avg", "Stdev", "Max"])
        });
        shortLatency.push(asLowRow(chalk.bold("Latency"), asMs(result.latency)));
        logToLocalStr("\n" + shortLatency.toString());
        const requests = new Table({
          head: asColor(chalk.cyan, ["Stat", "1%", "2.5%", "50%", "97.5%", "Avg", "Stdev", "Min"])
        });
        requests.push(asHighRow(chalk.bold("Req/Sec"), asNumber(result.requests)));
        requests.push(asHighRow(chalk.bold("Bytes/Sec"), asBytes(result.throughput)));
        logToLocalStr(requests.toString());
        if (opts.renderStatusCodes === true) {
          const statusCodeStats = new Table({
            head: asColor(chalk.cyan, ["Code", "Count"])
          });
          Object.keys(result.statusCodeStats).forEach((statusCode) => {
            const stats = result.statusCodeStats[statusCode];
            const colorize = colorizeByStatusCode(chalk, statusCode);
            statusCodeStats.push([colorize(statusCode), stats.count]);
          });
          logToLocalStr(statusCodeStats.toString());
        }
        logToLocalStr("");
        if (result.sampleInt === 1e3) {
          logToLocalStr("Req/Bytes counts sampled once per second.");
        } else {
          logToLocalStr("Req/Bytes counts sampled every " + result.sampleInt / 1e3 + " seconds.");
        }
        logToLocalStr("# of samples: " + result.samples);
        logToLocalStr("");
        if (opts.renderLatencyTable) {
          const latencies = new Table({
            head: asColor(chalk.cyan, ["Percentile", "Latency (ms)"])
          });
          percentiles.map((perc) => {
            const key = `p${perc}`.replace(".", "_");
            return [
              chalk.bold("" + perc),
              result.latency[key]
            ];
          }).forEach((row) => {
            latencies.push(row);
          });
          logToLocalStr(latencies.toString());
          logToLocalStr("");
        }
      }
      if (result.non2xx) {
        logToLocalStr(`${result["2xx"]} 2xx responses, ${result.non2xx} non 2xx responses`);
      }
      logToLocalStr(`${format(result.requests.sent)} requests in ${result.duration}s, ${prettyBytes(result.throughput.total)} read`);
      if (result.errors) {
        logToLocalStr(`${format(result.errors)} errors (${format(result.timeouts)} timeouts)`);
      }
      if (result.mismatches) {
        logToLocalStr(`${format(result.mismatches)} requests with mismatched body`);
      }
      if (result.resets) {
        logToLocalStr(`request pipeline was resetted ${format(result.resets)} ${result.resets === 1 ? "time" : "times"}`);
      }
      function logToLocalStr(msg) {
        strResult += msg + "\n";
      }
      return strResult;
    };
    function asLowRow(name, stat) {
      return [
        name,
        stat.p2_5,
        stat.p50,
        stat.p97_5,
        stat.p99,
        stat.average,
        stat.stddev,
        typeof stat.max === "string" ? stat.max : Math.floor(stat.max * 100) / 100
      ];
    }
    function asHighRow(name, stat) {
      return [
        name,
        stat.p1,
        stat.p2_5,
        stat.p50,
        stat.p97_5,
        stat.average,
        stat.stddev,
        typeof stat.min === "string" ? stat.min : Math.floor(stat.min * 100) / 100
      ];
    }
    function asColor(colorise, row) {
      return row.map((entry) => colorise(entry));
    }
    function asMs(stat) {
      const result = /* @__PURE__ */ Object.create(null);
      for (const k of Object.keys(stat)) {
        result[k] = `${stat[k]} ms`;
      }
      result.max = typeof stat.max === "string" ? stat.max : `${Math.floor(stat.max * 100) / 100} ms`;
      return result;
    }
    function asNumber(stat) {
      const result = /* @__PURE__ */ Object.create(null);
      for (const k of Object.keys(stat)) {
        result[k] = stat[k].toLocaleString(void 0, {
          // to show all digits
          maximumFractionDigits: 20
        });
      }
      return result;
    }
    function asBytes(stat) {
      const result = Object.create(stat);
      for (const p of percentiles) {
        const key = `p${p}`.replace(".", "_");
        result[key] = prettyBytes(stat[key]);
      }
      result.average = prettyBytes(stat.average);
      result.stddev = prettyBytes(stat.stddev);
      result.max = prettyBytes(stat.max);
      result.min = prettyBytes(stat.min);
      return result;
    }
    function colorizeByStatusCode(chalk, statusCode) {
      const codeClass = Math.floor(parseInt(statusCode) / 100) - 1;
      return [chalk.cyan, chalk.cyan, chalk.cyan, chalk.redBright, chalk.redBright][codeClass];
    }
    module2.exports = printResult2;
  }
});

// node_modules/autocannon/lib/worker_threads.js
var require_worker_threads = __commonJS({
  "node_modules/autocannon/lib/worker_threads.js"(exports2, module2) {
    "use strict";
    var workerThreads = {};
    try {
      workerThreads = require("worker_threads");
    } catch (err) {
      if (err) {
      }
      workerThreads = {
        isMainThread: true
      };
    }
    module2.exports = workerThreads;
  }
});

// node_modules/autocannon/lib/aggregateResult.js
var require_aggregateResult = __commonJS({
  "node_modules/autocannon/lib/aggregateResult.js"(exports2, module2) {
    "use strict";
    var { decodeHist, getHistograms, histAsObj, addPercentiles } = require_histUtil();
    function aggregateResult2(results, opts, histograms) {
      results = Array.isArray(results) ? results : [results];
      histograms = getHistograms(histograms);
      const aggregated = results.map((r) => ({
        ...r,
        latencies: decodeHist(r.latencies),
        requests: decodeHist(r.requests),
        throughput: decodeHist(r.throughput)
      })).reduce((acc, r) => {
        acc.latencies.add(r.latencies);
        acc.totalCompletedRequests += r.totalCompletedRequests;
        acc.totalRequests += r.totalRequests;
        acc.totalBytes += r.totalBytes;
        acc.samples += r.samples;
        acc.errors += r.errors;
        acc.timeouts += r.timeouts;
        acc.mismatches += r.mismatches;
        acc.non2xx += r.non2xx;
        acc.resets += r.resets;
        acc["1xx"] += r["1xx"];
        acc["2xx"] += r["2xx"];
        acc["3xx"] += r["3xx"];
        acc["4xx"] += r["4xx"];
        acc["5xx"] += r["5xx"];
        Object.keys(r.statusCodeStats).forEach((statusCode) => {
          if (!acc.statusCodeStats[statusCode]) {
            acc.statusCodeStats[statusCode] = r.statusCodeStats[statusCode];
          } else {
            acc.statusCodeStats[statusCode].count += r.statusCodeStats[statusCode].count;
          }
        });
        return acc;
      });
      const result = {
        title: opts.title,
        url: opts.url,
        socketPath: opts.socketPath,
        connections: opts.connections,
        sampleInt: opts.sampleInt,
        pipelining: opts.pipelining,
        workers: opts.workers,
        duration: aggregated.duration,
        samples: aggregated.samples,
        start: aggregated.start,
        finish: aggregated.finish,
        errors: aggregated.errors,
        timeouts: aggregated.timeouts,
        mismatches: aggregated.mismatches,
        non2xx: aggregated.non2xx,
        resets: aggregated.resets,
        "1xx": aggregated["1xx"],
        "2xx": aggregated["2xx"],
        "3xx": aggregated["3xx"],
        "4xx": aggregated["4xx"],
        "5xx": aggregated["5xx"],
        statusCodeStats: aggregated.statusCodeStats,
        latency: addPercentiles(aggregated.latencies, histAsObj(aggregated.latencies)),
        requests: addPercentiles(histograms.requests, histAsObj(histograms.requests, aggregated.totalCompletedRequests)),
        throughput: addPercentiles(histograms.throughput, histAsObj(histograms.throughput, aggregated.totalBytes))
      };
      result.latency.totalCount = aggregated.latencies.totalCount;
      result.requests.sent = aggregated.totalRequests;
      if (result.requests.min >= Number.MAX_SAFE_INTEGER) result.requests.min = 0;
      if (result.throughput.min >= Number.MAX_SAFE_INTEGER) result.throughput.min = 0;
      if (result.latency.min >= Number.MAX_SAFE_INTEGER) result.latency.min = 0;
      return result;
    }
    module2.exports = aggregateResult2;
  }
});

// node_modules/autocannon/lib/manager.js
var require_manager = __commonJS({
  "node_modules/autocannon/lib/manager.js"(exports2, module2) {
    "use strict";
    var path2 = require("path");
    var EE = require("events").EventEmitter;
    var aggregateResult2 = require_aggregateResult();
    var { getHistograms } = require_histUtil();
    var { Worker } = require_worker_threads();
    function initWorkers(opts, tracker, cb) {
      tracker = tracker || new EE();
      const workers = [];
      const results = [];
      const numWorkers = +opts.workers;
      const histograms = getHistograms();
      const histData = {
        requests: [],
        throughput: []
      };
      let restart = true;
      function reset() {
        workers.length = 0;
        results.length = 0;
        histograms.requests.reset();
        histograms.throughput.reset();
        histData.requests.length = 0;
        histData.throughput.length = 0;
      }
      function startAll() {
        for (const w of workers) {
          w.postMessage({ cmd: "START" });
        }
        setImmediate(() => {
          tracker.emit("start");
        });
      }
      function handleFinish() {
        const result = aggregateResult2(results, opts, histograms);
        cb(null, result);
        reset();
        if (opts.forever && restart) {
          setImmediate(() => {
            init();
            startAll();
          });
        }
      }
      function stopAll() {
        for (const w of workers) {
          w.postMessage({ cmd: "STOP" });
        }
        reset();
      }
      const workerOpts = {
        ...opts,
        ...opts.amount ? { amount: Math.max(Math.floor(opts.amount / numWorkers), 1) } : void 0,
        ...opts.connections ? { connections: Math.max(Math.floor(opts.connections / numWorkers), 1) } : void 0
      };
      workerOpts.a = workerOpts.amount;
      workerOpts.c = workerOpts.connections;
      function init() {
        for (let i = 0; i < numWorkers; i++) {
          const worker = new Worker(path2.resolve(__dirname, "./worker.js"), { workerData: { opts: workerOpts } });
          worker.on("message", (msg) => {
            const { cmd, data, error } = msg;
            if (cmd === "RESULT") {
              results.push(data);
              if (results.length === workers.length) {
                handleFinish();
              }
            } else if (cmd === "UPDATE_HIST") {
              const { name, value } = data;
              histData[name].push(value);
              if (histData[name].length === workers.length) {
                const total = histData[name].reduce((acc, v) => acc + v, 0);
                histData[name].length = 0;
                histograms[name].recordValue(total);
              }
            } else if (cmd === "RESET_HIST") {
              const { name } = data;
              histograms[name].reset();
            } else if (cmd === "ERROR") {
              tracker.emit("error", error);
            }
          });
          worker.on("error", (err) => {
            console.log("Worker error:", err);
            stopAll();
            cb(err);
          });
          workers.push(worker);
        }
      }
      init();
      startAll();
      tracker.stop = () => {
        restart = false;
        stopAll();
      };
      return tracker;
    }
    module2.exports = initWorkers;
  }
});

// node_modules/autocannon/lib/defaultOptions.js
var require_defaultOptions = __commonJS({
  "node_modules/autocannon/lib/defaultOptions.js"(exports2, module2) {
    "use strict";
    var defaultOptions = {
      headers: {},
      method: "GET",
      duration: 10,
      connections: 10,
      sampleInt: 1e3,
      pipelining: 1,
      timeout: 10,
      maxConnectionRequests: 0,
      maxOverallRequests: 0,
      connectionRate: 0,
      overallRate: 0,
      amount: 0,
      reconnectRate: 0,
      forever: false,
      idReplacement: false,
      requests: [{}],
      servername: void 0,
      excludeErrorStats: false
    };
    module2.exports = defaultOptions;
  }
});

// node_modules/timestring/index.js
var require_timestring = __commonJS({
  "node_modules/timestring/index.js"(exports2, module2) {
    module2.exports = parseTimestring;
    var DEFAULT_OPTS = {
      hoursPerDay: 24,
      daysPerWeek: 7,
      weeksPerMonth: 4,
      monthsPerYear: 12,
      daysPerYear: 365.25
    };
    var UNIT_MAP = {
      ms: ["ms", "milli", "millisecond", "milliseconds"],
      s: ["s", "sec", "secs", "second", "seconds"],
      m: ["m", "min", "mins", "minute", "minutes"],
      h: ["h", "hr", "hrs", "hour", "hours"],
      d: ["d", "day", "days"],
      w: ["w", "week", "weeks"],
      mth: ["mon", "mth", "mths", "month", "months"],
      y: ["y", "yr", "yrs", "year", "years"]
    };
    function parseTimestring(string, returnUnit, opts) {
      opts = Object.assign({}, DEFAULT_OPTS, opts || {});
      let totalSeconds = 0;
      let unitValues = getUnitValues(opts);
      let groups = string.toLowerCase().replace(/[^.\w+-]+/g, "").match(/[-+]?[0-9.]+[a-z]+/g);
      if (groups === null) {
        throw new Error(`The string [${string}] could not be parsed by timestring`);
      }
      groups.forEach((group) => {
        let value = group.match(/[0-9.]+/g)[0];
        let unit = group.match(/[a-z]+/g)[0];
        totalSeconds += getSeconds(value, unit, unitValues);
      });
      if (returnUnit) {
        return convert(totalSeconds, returnUnit, unitValues);
      }
      return totalSeconds;
    }
    function getUnitValues(opts) {
      let unitValues = {
        ms: 1e-3,
        s: 1,
        m: 60,
        h: 3600
      };
      unitValues.d = opts.hoursPerDay * unitValues.h;
      unitValues.w = opts.daysPerWeek * unitValues.d;
      unitValues.mth = opts.daysPerYear / opts.monthsPerYear * unitValues.d;
      unitValues.y = opts.daysPerYear * unitValues.d;
      return unitValues;
    }
    function getUnitKey(unit) {
      for (let key of Object.keys(UNIT_MAP)) {
        if (UNIT_MAP[key].indexOf(unit) > -1) {
          return key;
        }
      }
      throw new Error(`The unit [${unit}] is not supported by timestring`);
    }
    function getSeconds(value, unit, unitValues) {
      return value * unitValues[getUnitKey(unit)];
    }
    function convert(value, unit, unitValues) {
      return value / unitValues[getUnitKey(unit)];
    }
  }
});

// node_modules/autocannon/lib/url.js
var require_url = __commonJS({
  "node_modules/autocannon/lib/url.js"(exports2) {
    "use strict";
    function checkURL2(url) {
      return typeof url === "string" && url || Array.isArray(url) && url.length > 0;
    }
    function ofURL2(url, asArray) {
      if (Array.isArray(url)) return url;
      if (typeof url === "string") {
        return {
          map(fn) {
            if (asArray) return [fn(url)];
            return fn(url);
          }
        };
      }
      throw new Error("url should only be a string or an array of string");
    }
    exports2.checkURL = checkURL2;
    exports2.ofURL = ofURL2;
  }
});

// node_modules/delayed-stream/lib/delayed_stream.js
var require_delayed_stream = __commonJS({
  "node_modules/delayed-stream/lib/delayed_stream.js"(exports2, module2) {
    var Stream = require("stream").Stream;
    var util = require("util");
    module2.exports = DelayedStream;
    function DelayedStream() {
      this.source = null;
      this.dataSize = 0;
      this.maxDataSize = 1024 * 1024;
      this.pauseStream = true;
      this._maxDataSizeExceeded = false;
      this._released = false;
      this._bufferedEvents = [];
    }
    util.inherits(DelayedStream, Stream);
    DelayedStream.create = function(source, options) {
      var delayedStream = new this();
      options = options || {};
      for (var option in options) {
        delayedStream[option] = options[option];
      }
      delayedStream.source = source;
      var realEmit = source.emit;
      source.emit = function() {
        delayedStream._handleEmit(arguments);
        return realEmit.apply(source, arguments);
      };
      source.on("error", function() {
      });
      if (delayedStream.pauseStream) {
        source.pause();
      }
      return delayedStream;
    };
    Object.defineProperty(DelayedStream.prototype, "readable", {
      configurable: true,
      enumerable: true,
      get: function() {
        return this.source.readable;
      }
    });
    DelayedStream.prototype.setEncoding = function() {
      return this.source.setEncoding.apply(this.source, arguments);
    };
    DelayedStream.prototype.resume = function() {
      if (!this._released) {
        this.release();
      }
      this.source.resume();
    };
    DelayedStream.prototype.pause = function() {
      this.source.pause();
    };
    DelayedStream.prototype.release = function() {
      this._released = true;
      this._bufferedEvents.forEach(function(args) {
        this.emit.apply(this, args);
      }.bind(this));
      this._bufferedEvents = [];
    };
    DelayedStream.prototype.pipe = function() {
      var r = Stream.prototype.pipe.apply(this, arguments);
      this.resume();
      return r;
    };
    DelayedStream.prototype._handleEmit = function(args) {
      if (this._released) {
        this.emit.apply(this, args);
        return;
      }
      if (args[0] === "data") {
        this.dataSize += args[1].length;
        this._checkIfMaxDataSizeExceeded();
      }
      this._bufferedEvents.push(args);
    };
    DelayedStream.prototype._checkIfMaxDataSizeExceeded = function() {
      if (this._maxDataSizeExceeded) {
        return;
      }
      if (this.dataSize <= this.maxDataSize) {
        return;
      }
      this._maxDataSizeExceeded = true;
      var message = "DelayedStream#maxDataSize of " + this.maxDataSize + " bytes exceeded.";
      this.emit("error", new Error(message));
    };
  }
});

// node_modules/combined-stream/lib/combined_stream.js
var require_combined_stream = __commonJS({
  "node_modules/combined-stream/lib/combined_stream.js"(exports2, module2) {
    var util = require("util");
    var Stream = require("stream").Stream;
    var DelayedStream = require_delayed_stream();
    module2.exports = CombinedStream;
    function CombinedStream() {
      this.writable = false;
      this.readable = true;
      this.dataSize = 0;
      this.maxDataSize = 2 * 1024 * 1024;
      this.pauseStreams = true;
      this._released = false;
      this._streams = [];
      this._currentStream = null;
      this._insideLoop = false;
      this._pendingNext = false;
    }
    util.inherits(CombinedStream, Stream);
    CombinedStream.create = function(options) {
      var combinedStream = new this();
      options = options || {};
      for (var option in options) {
        combinedStream[option] = options[option];
      }
      return combinedStream;
    };
    CombinedStream.isStreamLike = function(stream) {
      return typeof stream !== "function" && typeof stream !== "string" && typeof stream !== "boolean" && typeof stream !== "number" && !Buffer.isBuffer(stream);
    };
    CombinedStream.prototype.append = function(stream) {
      var isStreamLike = CombinedStream.isStreamLike(stream);
      if (isStreamLike) {
        if (!(stream instanceof DelayedStream)) {
          var newStream = DelayedStream.create(stream, {
            maxDataSize: Infinity,
            pauseStream: this.pauseStreams
          });
          stream.on("data", this._checkDataSize.bind(this));
          stream = newStream;
        }
        this._handleErrors(stream);
        if (this.pauseStreams) {
          stream.pause();
        }
      }
      this._streams.push(stream);
      return this;
    };
    CombinedStream.prototype.pipe = function(dest, options) {
      Stream.prototype.pipe.call(this, dest, options);
      this.resume();
      return dest;
    };
    CombinedStream.prototype._getNext = function() {
      this._currentStream = null;
      if (this._insideLoop) {
        this._pendingNext = true;
        return;
      }
      this._insideLoop = true;
      try {
        do {
          this._pendingNext = false;
          this._realGetNext();
        } while (this._pendingNext);
      } finally {
        this._insideLoop = false;
      }
    };
    CombinedStream.prototype._realGetNext = function() {
      var stream = this._streams.shift();
      if (typeof stream == "undefined") {
        this.end();
        return;
      }
      if (typeof stream !== "function") {
        this._pipeNext(stream);
        return;
      }
      var getStream = stream;
      getStream(function(stream2) {
        var isStreamLike = CombinedStream.isStreamLike(stream2);
        if (isStreamLike) {
          stream2.on("data", this._checkDataSize.bind(this));
          this._handleErrors(stream2);
        }
        this._pipeNext(stream2);
      }.bind(this));
    };
    CombinedStream.prototype._pipeNext = function(stream) {
      this._currentStream = stream;
      var isStreamLike = CombinedStream.isStreamLike(stream);
      if (isStreamLike) {
        stream.on("end", this._getNext.bind(this));
        stream.pipe(this, { end: false });
        return;
      }
      var value = stream;
      this.write(value);
      this._getNext();
    };
    CombinedStream.prototype._handleErrors = function(stream) {
      var self2 = this;
      stream.on("error", function(err) {
        self2._emitError(err);
      });
    };
    CombinedStream.prototype.write = function(data) {
      this.emit("data", data);
    };
    CombinedStream.prototype.pause = function() {
      if (!this.pauseStreams) {
        return;
      }
      if (this.pauseStreams && this._currentStream && typeof this._currentStream.pause == "function") this._currentStream.pause();
      this.emit("pause");
    };
    CombinedStream.prototype.resume = function() {
      if (!this._released) {
        this._released = true;
        this.writable = true;
        this._getNext();
      }
      if (this.pauseStreams && this._currentStream && typeof this._currentStream.resume == "function") this._currentStream.resume();
      this.emit("resume");
    };
    CombinedStream.prototype.end = function() {
      this._reset();
      this.emit("end");
    };
    CombinedStream.prototype.destroy = function() {
      this._reset();
      this.emit("close");
    };
    CombinedStream.prototype._reset = function() {
      this.writable = false;
      this._streams = [];
      this._currentStream = null;
    };
    CombinedStream.prototype._checkDataSize = function() {
      this._updateDataSize();
      if (this.dataSize <= this.maxDataSize) {
        return;
      }
      var message = "DelayedStream#maxDataSize of " + this.maxDataSize + " bytes exceeded.";
      this._emitError(new Error(message));
    };
    CombinedStream.prototype._updateDataSize = function() {
      this.dataSize = 0;
      var self2 = this;
      this._streams.forEach(function(stream) {
        if (!stream.dataSize) {
          return;
        }
        self2.dataSize += stream.dataSize;
      });
      if (this._currentStream && this._currentStream.dataSize) {
        this.dataSize += this._currentStream.dataSize;
      }
    };
    CombinedStream.prototype._emitError = function(err) {
      this._reset();
      this.emit("error", err);
    };
  }
});

// node_modules/mime-db/db.json
var require_db = __commonJS({
  "node_modules/mime-db/db.json"(exports2, module2) {
    module2.exports = {
      "application/1d-interleaved-parityfec": {
        source: "iana"
      },
      "application/3gpdash-qoe-report+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/3gpp-ims+xml": {
        source: "iana",
        compressible: true
      },
      "application/3gpphal+json": {
        source: "iana",
        compressible: true
      },
      "application/3gpphalforms+json": {
        source: "iana",
        compressible: true
      },
      "application/a2l": {
        source: "iana"
      },
      "application/ace+cbor": {
        source: "iana"
      },
      "application/activemessage": {
        source: "iana"
      },
      "application/activity+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-costmap+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-costmapfilter+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-directory+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-endpointcost+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-endpointcostparams+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-endpointprop+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-endpointpropparams+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-error+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-networkmap+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-networkmapfilter+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-updatestreamcontrol+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-updatestreamparams+json": {
        source: "iana",
        compressible: true
      },
      "application/aml": {
        source: "iana"
      },
      "application/andrew-inset": {
        source: "iana",
        extensions: ["ez"]
      },
      "application/applefile": {
        source: "iana"
      },
      "application/applixware": {
        source: "apache",
        extensions: ["aw"]
      },
      "application/at+jwt": {
        source: "iana"
      },
      "application/atf": {
        source: "iana"
      },
      "application/atfx": {
        source: "iana"
      },
      "application/atom+xml": {
        source: "iana",
        compressible: true,
        extensions: ["atom"]
      },
      "application/atomcat+xml": {
        source: "iana",
        compressible: true,
        extensions: ["atomcat"]
      },
      "application/atomdeleted+xml": {
        source: "iana",
        compressible: true,
        extensions: ["atomdeleted"]
      },
      "application/atomicmail": {
        source: "iana"
      },
      "application/atomsvc+xml": {
        source: "iana",
        compressible: true,
        extensions: ["atomsvc"]
      },
      "application/atsc-dwd+xml": {
        source: "iana",
        compressible: true,
        extensions: ["dwd"]
      },
      "application/atsc-dynamic-event-message": {
        source: "iana"
      },
      "application/atsc-held+xml": {
        source: "iana",
        compressible: true,
        extensions: ["held"]
      },
      "application/atsc-rdt+json": {
        source: "iana",
        compressible: true
      },
      "application/atsc-rsat+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rsat"]
      },
      "application/atxml": {
        source: "iana"
      },
      "application/auth-policy+xml": {
        source: "iana",
        compressible: true
      },
      "application/bacnet-xdd+zip": {
        source: "iana",
        compressible: false
      },
      "application/batch-smtp": {
        source: "iana"
      },
      "application/bdoc": {
        compressible: false,
        extensions: ["bdoc"]
      },
      "application/beep+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/calendar+json": {
        source: "iana",
        compressible: true
      },
      "application/calendar+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xcs"]
      },
      "application/call-completion": {
        source: "iana"
      },
      "application/cals-1840": {
        source: "iana"
      },
      "application/captive+json": {
        source: "iana",
        compressible: true
      },
      "application/cbor": {
        source: "iana"
      },
      "application/cbor-seq": {
        source: "iana"
      },
      "application/cccex": {
        source: "iana"
      },
      "application/ccmp+xml": {
        source: "iana",
        compressible: true
      },
      "application/ccxml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["ccxml"]
      },
      "application/cdfx+xml": {
        source: "iana",
        compressible: true,
        extensions: ["cdfx"]
      },
      "application/cdmi-capability": {
        source: "iana",
        extensions: ["cdmia"]
      },
      "application/cdmi-container": {
        source: "iana",
        extensions: ["cdmic"]
      },
      "application/cdmi-domain": {
        source: "iana",
        extensions: ["cdmid"]
      },
      "application/cdmi-object": {
        source: "iana",
        extensions: ["cdmio"]
      },
      "application/cdmi-queue": {
        source: "iana",
        extensions: ["cdmiq"]
      },
      "application/cdni": {
        source: "iana"
      },
      "application/cea": {
        source: "iana"
      },
      "application/cea-2018+xml": {
        source: "iana",
        compressible: true
      },
      "application/cellml+xml": {
        source: "iana",
        compressible: true
      },
      "application/cfw": {
        source: "iana"
      },
      "application/city+json": {
        source: "iana",
        compressible: true
      },
      "application/clr": {
        source: "iana"
      },
      "application/clue+xml": {
        source: "iana",
        compressible: true
      },
      "application/clue_info+xml": {
        source: "iana",
        compressible: true
      },
      "application/cms": {
        source: "iana"
      },
      "application/cnrp+xml": {
        source: "iana",
        compressible: true
      },
      "application/coap-group+json": {
        source: "iana",
        compressible: true
      },
      "application/coap-payload": {
        source: "iana"
      },
      "application/commonground": {
        source: "iana"
      },
      "application/conference-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/cose": {
        source: "iana"
      },
      "application/cose-key": {
        source: "iana"
      },
      "application/cose-key-set": {
        source: "iana"
      },
      "application/cpl+xml": {
        source: "iana",
        compressible: true,
        extensions: ["cpl"]
      },
      "application/csrattrs": {
        source: "iana"
      },
      "application/csta+xml": {
        source: "iana",
        compressible: true
      },
      "application/cstadata+xml": {
        source: "iana",
        compressible: true
      },
      "application/csvm+json": {
        source: "iana",
        compressible: true
      },
      "application/cu-seeme": {
        source: "apache",
        extensions: ["cu"]
      },
      "application/cwt": {
        source: "iana"
      },
      "application/cybercash": {
        source: "iana"
      },
      "application/dart": {
        compressible: true
      },
      "application/dash+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mpd"]
      },
      "application/dash-patch+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mpp"]
      },
      "application/dashdelta": {
        source: "iana"
      },
      "application/davmount+xml": {
        source: "iana",
        compressible: true,
        extensions: ["davmount"]
      },
      "application/dca-rft": {
        source: "iana"
      },
      "application/dcd": {
        source: "iana"
      },
      "application/dec-dx": {
        source: "iana"
      },
      "application/dialog-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/dicom": {
        source: "iana"
      },
      "application/dicom+json": {
        source: "iana",
        compressible: true
      },
      "application/dicom+xml": {
        source: "iana",
        compressible: true
      },
      "application/dii": {
        source: "iana"
      },
      "application/dit": {
        source: "iana"
      },
      "application/dns": {
        source: "iana"
      },
      "application/dns+json": {
        source: "iana",
        compressible: true
      },
      "application/dns-message": {
        source: "iana"
      },
      "application/docbook+xml": {
        source: "apache",
        compressible: true,
        extensions: ["dbk"]
      },
      "application/dots+cbor": {
        source: "iana"
      },
      "application/dskpp+xml": {
        source: "iana",
        compressible: true
      },
      "application/dssc+der": {
        source: "iana",
        extensions: ["dssc"]
      },
      "application/dssc+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xdssc"]
      },
      "application/dvcs": {
        source: "iana"
      },
      "application/ecmascript": {
        source: "iana",
        compressible: true,
        extensions: ["es", "ecma"]
      },
      "application/edi-consent": {
        source: "iana"
      },
      "application/edi-x12": {
        source: "iana",
        compressible: false
      },
      "application/edifact": {
        source: "iana",
        compressible: false
      },
      "application/efi": {
        source: "iana"
      },
      "application/elm+json": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/elm+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.cap+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/emergencycalldata.comment+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.control+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.deviceinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.ecall.msd": {
        source: "iana"
      },
      "application/emergencycalldata.providerinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.serviceinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.subscriberinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.veds+xml": {
        source: "iana",
        compressible: true
      },
      "application/emma+xml": {
        source: "iana",
        compressible: true,
        extensions: ["emma"]
      },
      "application/emotionml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["emotionml"]
      },
      "application/encaprtp": {
        source: "iana"
      },
      "application/epp+xml": {
        source: "iana",
        compressible: true
      },
      "application/epub+zip": {
        source: "iana",
        compressible: false,
        extensions: ["epub"]
      },
      "application/eshop": {
        source: "iana"
      },
      "application/exi": {
        source: "iana",
        extensions: ["exi"]
      },
      "application/expect-ct-report+json": {
        source: "iana",
        compressible: true
      },
      "application/express": {
        source: "iana",
        extensions: ["exp"]
      },
      "application/fastinfoset": {
        source: "iana"
      },
      "application/fastsoap": {
        source: "iana"
      },
      "application/fdt+xml": {
        source: "iana",
        compressible: true,
        extensions: ["fdt"]
      },
      "application/fhir+json": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/fhir+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/fido.trusted-apps+json": {
        compressible: true
      },
      "application/fits": {
        source: "iana"
      },
      "application/flexfec": {
        source: "iana"
      },
      "application/font-sfnt": {
        source: "iana"
      },
      "application/font-tdpfr": {
        source: "iana",
        extensions: ["pfr"]
      },
      "application/font-woff": {
        source: "iana",
        compressible: false
      },
      "application/framework-attributes+xml": {
        source: "iana",
        compressible: true
      },
      "application/geo+json": {
        source: "iana",
        compressible: true,
        extensions: ["geojson"]
      },
      "application/geo+json-seq": {
        source: "iana"
      },
      "application/geopackage+sqlite3": {
        source: "iana"
      },
      "application/geoxacml+xml": {
        source: "iana",
        compressible: true
      },
      "application/gltf-buffer": {
        source: "iana"
      },
      "application/gml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["gml"]
      },
      "application/gpx+xml": {
        source: "apache",
        compressible: true,
        extensions: ["gpx"]
      },
      "application/gxf": {
        source: "apache",
        extensions: ["gxf"]
      },
      "application/gzip": {
        source: "iana",
        compressible: false,
        extensions: ["gz"]
      },
      "application/h224": {
        source: "iana"
      },
      "application/held+xml": {
        source: "iana",
        compressible: true
      },
      "application/hjson": {
        extensions: ["hjson"]
      },
      "application/http": {
        source: "iana"
      },
      "application/hyperstudio": {
        source: "iana",
        extensions: ["stk"]
      },
      "application/ibe-key-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/ibe-pkg-reply+xml": {
        source: "iana",
        compressible: true
      },
      "application/ibe-pp-data": {
        source: "iana"
      },
      "application/iges": {
        source: "iana"
      },
      "application/im-iscomposing+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/index": {
        source: "iana"
      },
      "application/index.cmd": {
        source: "iana"
      },
      "application/index.obj": {
        source: "iana"
      },
      "application/index.response": {
        source: "iana"
      },
      "application/index.vnd": {
        source: "iana"
      },
      "application/inkml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["ink", "inkml"]
      },
      "application/iotp": {
        source: "iana"
      },
      "application/ipfix": {
        source: "iana",
        extensions: ["ipfix"]
      },
      "application/ipp": {
        source: "iana"
      },
      "application/isup": {
        source: "iana"
      },
      "application/its+xml": {
        source: "iana",
        compressible: true,
        extensions: ["its"]
      },
      "application/java-archive": {
        source: "apache",
        compressible: false,
        extensions: ["jar", "war", "ear"]
      },
      "application/java-serialized-object": {
        source: "apache",
        compressible: false,
        extensions: ["ser"]
      },
      "application/java-vm": {
        source: "apache",
        compressible: false,
        extensions: ["class"]
      },
      "application/javascript": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["js", "mjs"]
      },
      "application/jf2feed+json": {
        source: "iana",
        compressible: true
      },
      "application/jose": {
        source: "iana"
      },
      "application/jose+json": {
        source: "iana",
        compressible: true
      },
      "application/jrd+json": {
        source: "iana",
        compressible: true
      },
      "application/jscalendar+json": {
        source: "iana",
        compressible: true
      },
      "application/json": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["json", "map"]
      },
      "application/json-patch+json": {
        source: "iana",
        compressible: true
      },
      "application/json-seq": {
        source: "iana"
      },
      "application/json5": {
        extensions: ["json5"]
      },
      "application/jsonml+json": {
        source: "apache",
        compressible: true,
        extensions: ["jsonml"]
      },
      "application/jwk+json": {
        source: "iana",
        compressible: true
      },
      "application/jwk-set+json": {
        source: "iana",
        compressible: true
      },
      "application/jwt": {
        source: "iana"
      },
      "application/kpml-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/kpml-response+xml": {
        source: "iana",
        compressible: true
      },
      "application/ld+json": {
        source: "iana",
        compressible: true,
        extensions: ["jsonld"]
      },
      "application/lgr+xml": {
        source: "iana",
        compressible: true,
        extensions: ["lgr"]
      },
      "application/link-format": {
        source: "iana"
      },
      "application/load-control+xml": {
        source: "iana",
        compressible: true
      },
      "application/lost+xml": {
        source: "iana",
        compressible: true,
        extensions: ["lostxml"]
      },
      "application/lostsync+xml": {
        source: "iana",
        compressible: true
      },
      "application/lpf+zip": {
        source: "iana",
        compressible: false
      },
      "application/lxf": {
        source: "iana"
      },
      "application/mac-binhex40": {
        source: "iana",
        extensions: ["hqx"]
      },
      "application/mac-compactpro": {
        source: "apache",
        extensions: ["cpt"]
      },
      "application/macwriteii": {
        source: "iana"
      },
      "application/mads+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mads"]
      },
      "application/manifest+json": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["webmanifest"]
      },
      "application/marc": {
        source: "iana",
        extensions: ["mrc"]
      },
      "application/marcxml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mrcx"]
      },
      "application/mathematica": {
        source: "iana",
        extensions: ["ma", "nb", "mb"]
      },
      "application/mathml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mathml"]
      },
      "application/mathml-content+xml": {
        source: "iana",
        compressible: true
      },
      "application/mathml-presentation+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-associated-procedure-description+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-deregister+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-envelope+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-msk+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-msk-response+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-protection-description+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-reception-report+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-register+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-register-response+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-schedule+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-user-service-description+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbox": {
        source: "iana",
        extensions: ["mbox"]
      },
      "application/media-policy-dataset+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mpf"]
      },
      "application/media_control+xml": {
        source: "iana",
        compressible: true
      },
      "application/mediaservercontrol+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mscml"]
      },
      "application/merge-patch+json": {
        source: "iana",
        compressible: true
      },
      "application/metalink+xml": {
        source: "apache",
        compressible: true,
        extensions: ["metalink"]
      },
      "application/metalink4+xml": {
        source: "iana",
        compressible: true,
        extensions: ["meta4"]
      },
      "application/mets+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mets"]
      },
      "application/mf4": {
        source: "iana"
      },
      "application/mikey": {
        source: "iana"
      },
      "application/mipc": {
        source: "iana"
      },
      "application/missing-blocks+cbor-seq": {
        source: "iana"
      },
      "application/mmt-aei+xml": {
        source: "iana",
        compressible: true,
        extensions: ["maei"]
      },
      "application/mmt-usd+xml": {
        source: "iana",
        compressible: true,
        extensions: ["musd"]
      },
      "application/mods+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mods"]
      },
      "application/moss-keys": {
        source: "iana"
      },
      "application/moss-signature": {
        source: "iana"
      },
      "application/mosskey-data": {
        source: "iana"
      },
      "application/mosskey-request": {
        source: "iana"
      },
      "application/mp21": {
        source: "iana",
        extensions: ["m21", "mp21"]
      },
      "application/mp4": {
        source: "iana",
        extensions: ["mp4s", "m4p"]
      },
      "application/mpeg4-generic": {
        source: "iana"
      },
      "application/mpeg4-iod": {
        source: "iana"
      },
      "application/mpeg4-iod-xmt": {
        source: "iana"
      },
      "application/mrb-consumer+xml": {
        source: "iana",
        compressible: true
      },
      "application/mrb-publish+xml": {
        source: "iana",
        compressible: true
      },
      "application/msc-ivr+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/msc-mixer+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/msword": {
        source: "iana",
        compressible: false,
        extensions: ["doc", "dot"]
      },
      "application/mud+json": {
        source: "iana",
        compressible: true
      },
      "application/multipart-core": {
        source: "iana"
      },
      "application/mxf": {
        source: "iana",
        extensions: ["mxf"]
      },
      "application/n-quads": {
        source: "iana",
        extensions: ["nq"]
      },
      "application/n-triples": {
        source: "iana",
        extensions: ["nt"]
      },
      "application/nasdata": {
        source: "iana"
      },
      "application/news-checkgroups": {
        source: "iana",
        charset: "US-ASCII"
      },
      "application/news-groupinfo": {
        source: "iana",
        charset: "US-ASCII"
      },
      "application/news-transmission": {
        source: "iana"
      },
      "application/nlsml+xml": {
        source: "iana",
        compressible: true
      },
      "application/node": {
        source: "iana",
        extensions: ["cjs"]
      },
      "application/nss": {
        source: "iana"
      },
      "application/oauth-authz-req+jwt": {
        source: "iana"
      },
      "application/oblivious-dns-message": {
        source: "iana"
      },
      "application/ocsp-request": {
        source: "iana"
      },
      "application/ocsp-response": {
        source: "iana"
      },
      "application/octet-stream": {
        source: "iana",
        compressible: false,
        extensions: ["bin", "dms", "lrf", "mar", "so", "dist", "distz", "pkg", "bpk", "dump", "elc", "deploy", "exe", "dll", "deb", "dmg", "iso", "img", "msi", "msp", "msm", "buffer"]
      },
      "application/oda": {
        source: "iana",
        extensions: ["oda"]
      },
      "application/odm+xml": {
        source: "iana",
        compressible: true
      },
      "application/odx": {
        source: "iana"
      },
      "application/oebps-package+xml": {
        source: "iana",
        compressible: true,
        extensions: ["opf"]
      },
      "application/ogg": {
        source: "iana",
        compressible: false,
        extensions: ["ogx"]
      },
      "application/omdoc+xml": {
        source: "apache",
        compressible: true,
        extensions: ["omdoc"]
      },
      "application/onenote": {
        source: "apache",
        extensions: ["onetoc", "onetoc2", "onetmp", "onepkg"]
      },
      "application/opc-nodeset+xml": {
        source: "iana",
        compressible: true
      },
      "application/oscore": {
        source: "iana"
      },
      "application/oxps": {
        source: "iana",
        extensions: ["oxps"]
      },
      "application/p21": {
        source: "iana"
      },
      "application/p21+zip": {
        source: "iana",
        compressible: false
      },
      "application/p2p-overlay+xml": {
        source: "iana",
        compressible: true,
        extensions: ["relo"]
      },
      "application/parityfec": {
        source: "iana"
      },
      "application/passport": {
        source: "iana"
      },
      "application/patch-ops-error+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xer"]
      },
      "application/pdf": {
        source: "iana",
        compressible: false,
        extensions: ["pdf"]
      },
      "application/pdx": {
        source: "iana"
      },
      "application/pem-certificate-chain": {
        source: "iana"
      },
      "application/pgp-encrypted": {
        source: "iana",
        compressible: false,
        extensions: ["pgp"]
      },
      "application/pgp-keys": {
        source: "iana",
        extensions: ["asc"]
      },
      "application/pgp-signature": {
        source: "iana",
        extensions: ["asc", "sig"]
      },
      "application/pics-rules": {
        source: "apache",
        extensions: ["prf"]
      },
      "application/pidf+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/pidf-diff+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/pkcs10": {
        source: "iana",
        extensions: ["p10"]
      },
      "application/pkcs12": {
        source: "iana"
      },
      "application/pkcs7-mime": {
        source: "iana",
        extensions: ["p7m", "p7c"]
      },
      "application/pkcs7-signature": {
        source: "iana",
        extensions: ["p7s"]
      },
      "application/pkcs8": {
        source: "iana",
        extensions: ["p8"]
      },
      "application/pkcs8-encrypted": {
        source: "iana"
      },
      "application/pkix-attr-cert": {
        source: "iana",
        extensions: ["ac"]
      },
      "application/pkix-cert": {
        source: "iana",
        extensions: ["cer"]
      },
      "application/pkix-crl": {
        source: "iana",
        extensions: ["crl"]
      },
      "application/pkix-pkipath": {
        source: "iana",
        extensions: ["pkipath"]
      },
      "application/pkixcmp": {
        source: "iana",
        extensions: ["pki"]
      },
      "application/pls+xml": {
        source: "iana",
        compressible: true,
        extensions: ["pls"]
      },
      "application/poc-settings+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/postscript": {
        source: "iana",
        compressible: true,
        extensions: ["ai", "eps", "ps"]
      },
      "application/ppsp-tracker+json": {
        source: "iana",
        compressible: true
      },
      "application/problem+json": {
        source: "iana",
        compressible: true
      },
      "application/problem+xml": {
        source: "iana",
        compressible: true
      },
      "application/provenance+xml": {
        source: "iana",
        compressible: true,
        extensions: ["provx"]
      },
      "application/prs.alvestrand.titrax-sheet": {
        source: "iana"
      },
      "application/prs.cww": {
        source: "iana",
        extensions: ["cww"]
      },
      "application/prs.cyn": {
        source: "iana",
        charset: "7-BIT"
      },
      "application/prs.hpub+zip": {
        source: "iana",
        compressible: false
      },
      "application/prs.nprend": {
        source: "iana"
      },
      "application/prs.plucker": {
        source: "iana"
      },
      "application/prs.rdf-xml-crypt": {
        source: "iana"
      },
      "application/prs.xsf+xml": {
        source: "iana",
        compressible: true
      },
      "application/pskc+xml": {
        source: "iana",
        compressible: true,
        extensions: ["pskcxml"]
      },
      "application/pvd+json": {
        source: "iana",
        compressible: true
      },
      "application/qsig": {
        source: "iana"
      },
      "application/raml+yaml": {
        compressible: true,
        extensions: ["raml"]
      },
      "application/raptorfec": {
        source: "iana"
      },
      "application/rdap+json": {
        source: "iana",
        compressible: true
      },
      "application/rdf+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rdf", "owl"]
      },
      "application/reginfo+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rif"]
      },
      "application/relax-ng-compact-syntax": {
        source: "iana",
        extensions: ["rnc"]
      },
      "application/remote-printing": {
        source: "iana"
      },
      "application/reputon+json": {
        source: "iana",
        compressible: true
      },
      "application/resource-lists+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rl"]
      },
      "application/resource-lists-diff+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rld"]
      },
      "application/rfc+xml": {
        source: "iana",
        compressible: true
      },
      "application/riscos": {
        source: "iana"
      },
      "application/rlmi+xml": {
        source: "iana",
        compressible: true
      },
      "application/rls-services+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rs"]
      },
      "application/route-apd+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rapd"]
      },
      "application/route-s-tsid+xml": {
        source: "iana",
        compressible: true,
        extensions: ["sls"]
      },
      "application/route-usd+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rusd"]
      },
      "application/rpki-ghostbusters": {
        source: "iana",
        extensions: ["gbr"]
      },
      "application/rpki-manifest": {
        source: "iana",
        extensions: ["mft"]
      },
      "application/rpki-publication": {
        source: "iana"
      },
      "application/rpki-roa": {
        source: "iana",
        extensions: ["roa"]
      },
      "application/rpki-updown": {
        source: "iana"
      },
      "application/rsd+xml": {
        source: "apache",
        compressible: true,
        extensions: ["rsd"]
      },
      "application/rss+xml": {
        source: "apache",
        compressible: true,
        extensions: ["rss"]
      },
      "application/rtf": {
        source: "iana",
        compressible: true,
        extensions: ["rtf"]
      },
      "application/rtploopback": {
        source: "iana"
      },
      "application/rtx": {
        source: "iana"
      },
      "application/samlassertion+xml": {
        source: "iana",
        compressible: true
      },
      "application/samlmetadata+xml": {
        source: "iana",
        compressible: true
      },
      "application/sarif+json": {
        source: "iana",
        compressible: true
      },
      "application/sarif-external-properties+json": {
        source: "iana",
        compressible: true
      },
      "application/sbe": {
        source: "iana"
      },
      "application/sbml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["sbml"]
      },
      "application/scaip+xml": {
        source: "iana",
        compressible: true
      },
      "application/scim+json": {
        source: "iana",
        compressible: true
      },
      "application/scvp-cv-request": {
        source: "iana",
        extensions: ["scq"]
      },
      "application/scvp-cv-response": {
        source: "iana",
        extensions: ["scs"]
      },
      "application/scvp-vp-request": {
        source: "iana",
        extensions: ["spq"]
      },
      "application/scvp-vp-response": {
        source: "iana",
        extensions: ["spp"]
      },
      "application/sdp": {
        source: "iana",
        extensions: ["sdp"]
      },
      "application/secevent+jwt": {
        source: "iana"
      },
      "application/senml+cbor": {
        source: "iana"
      },
      "application/senml+json": {
        source: "iana",
        compressible: true
      },
      "application/senml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["senmlx"]
      },
      "application/senml-etch+cbor": {
        source: "iana"
      },
      "application/senml-etch+json": {
        source: "iana",
        compressible: true
      },
      "application/senml-exi": {
        source: "iana"
      },
      "application/sensml+cbor": {
        source: "iana"
      },
      "application/sensml+json": {
        source: "iana",
        compressible: true
      },
      "application/sensml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["sensmlx"]
      },
      "application/sensml-exi": {
        source: "iana"
      },
      "application/sep+xml": {
        source: "iana",
        compressible: true
      },
      "application/sep-exi": {
        source: "iana"
      },
      "application/session-info": {
        source: "iana"
      },
      "application/set-payment": {
        source: "iana"
      },
      "application/set-payment-initiation": {
        source: "iana",
        extensions: ["setpay"]
      },
      "application/set-registration": {
        source: "iana"
      },
      "application/set-registration-initiation": {
        source: "iana",
        extensions: ["setreg"]
      },
      "application/sgml": {
        source: "iana"
      },
      "application/sgml-open-catalog": {
        source: "iana"
      },
      "application/shf+xml": {
        source: "iana",
        compressible: true,
        extensions: ["shf"]
      },
      "application/sieve": {
        source: "iana",
        extensions: ["siv", "sieve"]
      },
      "application/simple-filter+xml": {
        source: "iana",
        compressible: true
      },
      "application/simple-message-summary": {
        source: "iana"
      },
      "application/simplesymbolcontainer": {
        source: "iana"
      },
      "application/sipc": {
        source: "iana"
      },
      "application/slate": {
        source: "iana"
      },
      "application/smil": {
        source: "iana"
      },
      "application/smil+xml": {
        source: "iana",
        compressible: true,
        extensions: ["smi", "smil"]
      },
      "application/smpte336m": {
        source: "iana"
      },
      "application/soap+fastinfoset": {
        source: "iana"
      },
      "application/soap+xml": {
        source: "iana",
        compressible: true
      },
      "application/sparql-query": {
        source: "iana",
        extensions: ["rq"]
      },
      "application/sparql-results+xml": {
        source: "iana",
        compressible: true,
        extensions: ["srx"]
      },
      "application/spdx+json": {
        source: "iana",
        compressible: true
      },
      "application/spirits-event+xml": {
        source: "iana",
        compressible: true
      },
      "application/sql": {
        source: "iana"
      },
      "application/srgs": {
        source: "iana",
        extensions: ["gram"]
      },
      "application/srgs+xml": {
        source: "iana",
        compressible: true,
        extensions: ["grxml"]
      },
      "application/sru+xml": {
        source: "iana",
        compressible: true,
        extensions: ["sru"]
      },
      "application/ssdl+xml": {
        source: "apache",
        compressible: true,
        extensions: ["ssdl"]
      },
      "application/ssml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["ssml"]
      },
      "application/stix+json": {
        source: "iana",
        compressible: true
      },
      "application/swid+xml": {
        source: "iana",
        compressible: true,
        extensions: ["swidtag"]
      },
      "application/tamp-apex-update": {
        source: "iana"
      },
      "application/tamp-apex-update-confirm": {
        source: "iana"
      },
      "application/tamp-community-update": {
        source: "iana"
      },
      "application/tamp-community-update-confirm": {
        source: "iana"
      },
      "application/tamp-error": {
        source: "iana"
      },
      "application/tamp-sequence-adjust": {
        source: "iana"
      },
      "application/tamp-sequence-adjust-confirm": {
        source: "iana"
      },
      "application/tamp-status-query": {
        source: "iana"
      },
      "application/tamp-status-response": {
        source: "iana"
      },
      "application/tamp-update": {
        source: "iana"
      },
      "application/tamp-update-confirm": {
        source: "iana"
      },
      "application/tar": {
        compressible: true
      },
      "application/taxii+json": {
        source: "iana",
        compressible: true
      },
      "application/td+json": {
        source: "iana",
        compressible: true
      },
      "application/tei+xml": {
        source: "iana",
        compressible: true,
        extensions: ["tei", "teicorpus"]
      },
      "application/tetra_isi": {
        source: "iana"
      },
      "application/thraud+xml": {
        source: "iana",
        compressible: true,
        extensions: ["tfi"]
      },
      "application/timestamp-query": {
        source: "iana"
      },
      "application/timestamp-reply": {
        source: "iana"
      },
      "application/timestamped-data": {
        source: "iana",
        extensions: ["tsd"]
      },
      "application/tlsrpt+gzip": {
        source: "iana"
      },
      "application/tlsrpt+json": {
        source: "iana",
        compressible: true
      },
      "application/tnauthlist": {
        source: "iana"
      },
      "application/token-introspection+jwt": {
        source: "iana"
      },
      "application/toml": {
        compressible: true,
        extensions: ["toml"]
      },
      "application/trickle-ice-sdpfrag": {
        source: "iana"
      },
      "application/trig": {
        source: "iana",
        extensions: ["trig"]
      },
      "application/ttml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["ttml"]
      },
      "application/tve-trigger": {
        source: "iana"
      },
      "application/tzif": {
        source: "iana"
      },
      "application/tzif-leap": {
        source: "iana"
      },
      "application/ubjson": {
        compressible: false,
        extensions: ["ubj"]
      },
      "application/ulpfec": {
        source: "iana"
      },
      "application/urc-grpsheet+xml": {
        source: "iana",
        compressible: true
      },
      "application/urc-ressheet+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rsheet"]
      },
      "application/urc-targetdesc+xml": {
        source: "iana",
        compressible: true,
        extensions: ["td"]
      },
      "application/urc-uisocketdesc+xml": {
        source: "iana",
        compressible: true
      },
      "application/vcard+json": {
        source: "iana",
        compressible: true
      },
      "application/vcard+xml": {
        source: "iana",
        compressible: true
      },
      "application/vemmi": {
        source: "iana"
      },
      "application/vividence.scriptfile": {
        source: "apache"
      },
      "application/vnd.1000minds.decision-model+xml": {
        source: "iana",
        compressible: true,
        extensions: ["1km"]
      },
      "application/vnd.3gpp-prose+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp-prose-pc3ch+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp-v2x-local-service-information": {
        source: "iana"
      },
      "application/vnd.3gpp.5gnas": {
        source: "iana"
      },
      "application/vnd.3gpp.access-transfer-events+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.bsf+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.gmop+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.gtpc": {
        source: "iana"
      },
      "application/vnd.3gpp.interworking-data": {
        source: "iana"
      },
      "application/vnd.3gpp.lpp": {
        source: "iana"
      },
      "application/vnd.3gpp.mc-signalling-ear": {
        source: "iana"
      },
      "application/vnd.3gpp.mcdata-affiliation-command+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcdata-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcdata-payload": {
        source: "iana"
      },
      "application/vnd.3gpp.mcdata-service-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcdata-signalling": {
        source: "iana"
      },
      "application/vnd.3gpp.mcdata-ue-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcdata-user-profile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-affiliation-command+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-floor-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-location-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-mbms-usage-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-service-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-signed+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-ue-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-ue-init-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-user-profile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-affiliation-command+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-affiliation-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-location-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-mbms-usage-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-service-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-transmission-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-ue-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-user-profile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mid-call+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.ngap": {
        source: "iana"
      },
      "application/vnd.3gpp.pfcp": {
        source: "iana"
      },
      "application/vnd.3gpp.pic-bw-large": {
        source: "iana",
        extensions: ["plb"]
      },
      "application/vnd.3gpp.pic-bw-small": {
        source: "iana",
        extensions: ["psb"]
      },
      "application/vnd.3gpp.pic-bw-var": {
        source: "iana",
        extensions: ["pvb"]
      },
      "application/vnd.3gpp.s1ap": {
        source: "iana"
      },
      "application/vnd.3gpp.sms": {
        source: "iana"
      },
      "application/vnd.3gpp.sms+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.srvcc-ext+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.srvcc-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.state-and-event-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.ussd+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp2.bcmcsinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp2.sms": {
        source: "iana"
      },
      "application/vnd.3gpp2.tcap": {
        source: "iana",
        extensions: ["tcap"]
      },
      "application/vnd.3lightssoftware.imagescal": {
        source: "iana"
      },
      "application/vnd.3m.post-it-notes": {
        source: "iana",
        extensions: ["pwn"]
      },
      "application/vnd.accpac.simply.aso": {
        source: "iana",
        extensions: ["aso"]
      },
      "application/vnd.accpac.simply.imp": {
        source: "iana",
        extensions: ["imp"]
      },
      "application/vnd.acucobol": {
        source: "iana",
        extensions: ["acu"]
      },
      "application/vnd.acucorp": {
        source: "iana",
        extensions: ["atc", "acutc"]
      },
      "application/vnd.adobe.air-application-installer-package+zip": {
        source: "apache",
        compressible: false,
        extensions: ["air"]
      },
      "application/vnd.adobe.flash.movie": {
        source: "iana"
      },
      "application/vnd.adobe.formscentral.fcdt": {
        source: "iana",
        extensions: ["fcdt"]
      },
      "application/vnd.adobe.fxp": {
        source: "iana",
        extensions: ["fxp", "fxpl"]
      },
      "application/vnd.adobe.partial-upload": {
        source: "iana"
      },
      "application/vnd.adobe.xdp+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xdp"]
      },
      "application/vnd.adobe.xfdf": {
        source: "iana",
        extensions: ["xfdf"]
      },
      "application/vnd.aether.imp": {
        source: "iana"
      },
      "application/vnd.afpc.afplinedata": {
        source: "iana"
      },
      "application/vnd.afpc.afplinedata-pagedef": {
        source: "iana"
      },
      "application/vnd.afpc.cmoca-cmresource": {
        source: "iana"
      },
      "application/vnd.afpc.foca-charset": {
        source: "iana"
      },
      "application/vnd.afpc.foca-codedfont": {
        source: "iana"
      },
      "application/vnd.afpc.foca-codepage": {
        source: "iana"
      },
      "application/vnd.afpc.modca": {
        source: "iana"
      },
      "application/vnd.afpc.modca-cmtable": {
        source: "iana"
      },
      "application/vnd.afpc.modca-formdef": {
        source: "iana"
      },
      "application/vnd.afpc.modca-mediummap": {
        source: "iana"
      },
      "application/vnd.afpc.modca-objectcontainer": {
        source: "iana"
      },
      "application/vnd.afpc.modca-overlay": {
        source: "iana"
      },
      "application/vnd.afpc.modca-pagesegment": {
        source: "iana"
      },
      "application/vnd.age": {
        source: "iana",
        extensions: ["age"]
      },
      "application/vnd.ah-barcode": {
        source: "iana"
      },
      "application/vnd.ahead.space": {
        source: "iana",
        extensions: ["ahead"]
      },
      "application/vnd.airzip.filesecure.azf": {
        source: "iana",
        extensions: ["azf"]
      },
      "application/vnd.airzip.filesecure.azs": {
        source: "iana",
        extensions: ["azs"]
      },
      "application/vnd.amadeus+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.amazon.ebook": {
        source: "apache",
        extensions: ["azw"]
      },
      "application/vnd.amazon.mobi8-ebook": {
        source: "iana"
      },
      "application/vnd.americandynamics.acc": {
        source: "iana",
        extensions: ["acc"]
      },
      "application/vnd.amiga.ami": {
        source: "iana",
        extensions: ["ami"]
      },
      "application/vnd.amundsen.maze+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.android.ota": {
        source: "iana"
      },
      "application/vnd.android.package-archive": {
        source: "apache",
        compressible: false,
        extensions: ["apk"]
      },
      "application/vnd.anki": {
        source: "iana"
      },
      "application/vnd.anser-web-certificate-issue-initiation": {
        source: "iana",
        extensions: ["cii"]
      },
      "application/vnd.anser-web-funds-transfer-initiation": {
        source: "apache",
        extensions: ["fti"]
      },
      "application/vnd.antix.game-component": {
        source: "iana",
        extensions: ["atx"]
      },
      "application/vnd.apache.arrow.file": {
        source: "iana"
      },
      "application/vnd.apache.arrow.stream": {
        source: "iana"
      },
      "application/vnd.apache.thrift.binary": {
        source: "iana"
      },
      "application/vnd.apache.thrift.compact": {
        source: "iana"
      },
      "application/vnd.apache.thrift.json": {
        source: "iana"
      },
      "application/vnd.api+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.aplextor.warrp+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.apothekende.reservation+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.apple.installer+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mpkg"]
      },
      "application/vnd.apple.keynote": {
        source: "iana",
        extensions: ["key"]
      },
      "application/vnd.apple.mpegurl": {
        source: "iana",
        extensions: ["m3u8"]
      },
      "application/vnd.apple.numbers": {
        source: "iana",
        extensions: ["numbers"]
      },
      "application/vnd.apple.pages": {
        source: "iana",
        extensions: ["pages"]
      },
      "application/vnd.apple.pkpass": {
        compressible: false,
        extensions: ["pkpass"]
      },
      "application/vnd.arastra.swi": {
        source: "iana"
      },
      "application/vnd.aristanetworks.swi": {
        source: "iana",
        extensions: ["swi"]
      },
      "application/vnd.artisan+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.artsquare": {
        source: "iana"
      },
      "application/vnd.astraea-software.iota": {
        source: "iana",
        extensions: ["iota"]
      },
      "application/vnd.audiograph": {
        source: "iana",
        extensions: ["aep"]
      },
      "application/vnd.autopackage": {
        source: "iana"
      },
      "application/vnd.avalon+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.avistar+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.balsamiq.bmml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["bmml"]
      },
      "application/vnd.balsamiq.bmpr": {
        source: "iana"
      },
      "application/vnd.banana-accounting": {
        source: "iana"
      },
      "application/vnd.bbf.usp.error": {
        source: "iana"
      },
      "application/vnd.bbf.usp.msg": {
        source: "iana"
      },
      "application/vnd.bbf.usp.msg+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.bekitzur-stech+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.bint.med-content": {
        source: "iana"
      },
      "application/vnd.biopax.rdf+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.blink-idb-value-wrapper": {
        source: "iana"
      },
      "application/vnd.blueice.multipass": {
        source: "iana",
        extensions: ["mpm"]
      },
      "application/vnd.bluetooth.ep.oob": {
        source: "iana"
      },
      "application/vnd.bluetooth.le.oob": {
        source: "iana"
      },
      "application/vnd.bmi": {
        source: "iana",
        extensions: ["bmi"]
      },
      "application/vnd.bpf": {
        source: "iana"
      },
      "application/vnd.bpf3": {
        source: "iana"
      },
      "application/vnd.businessobjects": {
        source: "iana",
        extensions: ["rep"]
      },
      "application/vnd.byu.uapi+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cab-jscript": {
        source: "iana"
      },
      "application/vnd.canon-cpdl": {
        source: "iana"
      },
      "application/vnd.canon-lips": {
        source: "iana"
      },
      "application/vnd.capasystems-pg+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cendio.thinlinc.clientconf": {
        source: "iana"
      },
      "application/vnd.century-systems.tcp_stream": {
        source: "iana"
      },
      "application/vnd.chemdraw+xml": {
        source: "iana",
        compressible: true,
        extensions: ["cdxml"]
      },
      "application/vnd.chess-pgn": {
        source: "iana"
      },
      "application/vnd.chipnuts.karaoke-mmd": {
        source: "iana",
        extensions: ["mmd"]
      },
      "application/vnd.ciedi": {
        source: "iana"
      },
      "application/vnd.cinderella": {
        source: "iana",
        extensions: ["cdy"]
      },
      "application/vnd.cirpack.isdn-ext": {
        source: "iana"
      },
      "application/vnd.citationstyles.style+xml": {
        source: "iana",
        compressible: true,
        extensions: ["csl"]
      },
      "application/vnd.claymore": {
        source: "iana",
        extensions: ["cla"]
      },
      "application/vnd.cloanto.rp9": {
        source: "iana",
        extensions: ["rp9"]
      },
      "application/vnd.clonk.c4group": {
        source: "iana",
        extensions: ["c4g", "c4d", "c4f", "c4p", "c4u"]
      },
      "application/vnd.cluetrust.cartomobile-config": {
        source: "iana",
        extensions: ["c11amc"]
      },
      "application/vnd.cluetrust.cartomobile-config-pkg": {
        source: "iana",
        extensions: ["c11amz"]
      },
      "application/vnd.coffeescript": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.document": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.document-template": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.presentation": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.presentation-template": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.spreadsheet": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.spreadsheet-template": {
        source: "iana"
      },
      "application/vnd.collection+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.collection.doc+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.collection.next+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.comicbook+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.comicbook-rar": {
        source: "iana"
      },
      "application/vnd.commerce-battelle": {
        source: "iana"
      },
      "application/vnd.commonspace": {
        source: "iana",
        extensions: ["csp"]
      },
      "application/vnd.contact.cmsg": {
        source: "iana",
        extensions: ["cdbcmsg"]
      },
      "application/vnd.coreos.ignition+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cosmocaller": {
        source: "iana",
        extensions: ["cmc"]
      },
      "application/vnd.crick.clicker": {
        source: "iana",
        extensions: ["clkx"]
      },
      "application/vnd.crick.clicker.keyboard": {
        source: "iana",
        extensions: ["clkk"]
      },
      "application/vnd.crick.clicker.palette": {
        source: "iana",
        extensions: ["clkp"]
      },
      "application/vnd.crick.clicker.template": {
        source: "iana",
        extensions: ["clkt"]
      },
      "application/vnd.crick.clicker.wordbank": {
        source: "iana",
        extensions: ["clkw"]
      },
      "application/vnd.criticaltools.wbs+xml": {
        source: "iana",
        compressible: true,
        extensions: ["wbs"]
      },
      "application/vnd.cryptii.pipe+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.crypto-shade-file": {
        source: "iana"
      },
      "application/vnd.cryptomator.encrypted": {
        source: "iana"
      },
      "application/vnd.cryptomator.vault": {
        source: "iana"
      },
      "application/vnd.ctc-posml": {
        source: "iana",
        extensions: ["pml"]
      },
      "application/vnd.ctct.ws+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cups-pdf": {
        source: "iana"
      },
      "application/vnd.cups-postscript": {
        source: "iana"
      },
      "application/vnd.cups-ppd": {
        source: "iana",
        extensions: ["ppd"]
      },
      "application/vnd.cups-raster": {
        source: "iana"
      },
      "application/vnd.cups-raw": {
        source: "iana"
      },
      "application/vnd.curl": {
        source: "iana"
      },
      "application/vnd.curl.car": {
        source: "apache",
        extensions: ["car"]
      },
      "application/vnd.curl.pcurl": {
        source: "apache",
        extensions: ["pcurl"]
      },
      "application/vnd.cyan.dean.root+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cybank": {
        source: "iana"
      },
      "application/vnd.cyclonedx+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cyclonedx+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.d2l.coursepackage1p0+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.d3m-dataset": {
        source: "iana"
      },
      "application/vnd.d3m-problem": {
        source: "iana"
      },
      "application/vnd.dart": {
        source: "iana",
        compressible: true,
        extensions: ["dart"]
      },
      "application/vnd.data-vision.rdz": {
        source: "iana",
        extensions: ["rdz"]
      },
      "application/vnd.datapackage+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dataresource+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dbf": {
        source: "iana",
        extensions: ["dbf"]
      },
      "application/vnd.debian.binary-package": {
        source: "iana"
      },
      "application/vnd.dece.data": {
        source: "iana",
        extensions: ["uvf", "uvvf", "uvd", "uvvd"]
      },
      "application/vnd.dece.ttml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["uvt", "uvvt"]
      },
      "application/vnd.dece.unspecified": {
        source: "iana",
        extensions: ["uvx", "uvvx"]
      },
      "application/vnd.dece.zip": {
        source: "iana",
        extensions: ["uvz", "uvvz"]
      },
      "application/vnd.denovo.fcselayout-link": {
        source: "iana",
        extensions: ["fe_launch"]
      },
      "application/vnd.desmume.movie": {
        source: "iana"
      },
      "application/vnd.dir-bi.plate-dl-nosuffix": {
        source: "iana"
      },
      "application/vnd.dm.delegation+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dna": {
        source: "iana",
        extensions: ["dna"]
      },
      "application/vnd.document+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dolby.mlp": {
        source: "apache",
        extensions: ["mlp"]
      },
      "application/vnd.dolby.mobile.1": {
        source: "iana"
      },
      "application/vnd.dolby.mobile.2": {
        source: "iana"
      },
      "application/vnd.doremir.scorecloud-binary-document": {
        source: "iana"
      },
      "application/vnd.dpgraph": {
        source: "iana",
        extensions: ["dpg"]
      },
      "application/vnd.dreamfactory": {
        source: "iana",
        extensions: ["dfac"]
      },
      "application/vnd.drive+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ds-keypoint": {
        source: "apache",
        extensions: ["kpxx"]
      },
      "application/vnd.dtg.local": {
        source: "iana"
      },
      "application/vnd.dtg.local.flash": {
        source: "iana"
      },
      "application/vnd.dtg.local.html": {
        source: "iana"
      },
      "application/vnd.dvb.ait": {
        source: "iana",
        extensions: ["ait"]
      },
      "application/vnd.dvb.dvbisl+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.dvbj": {
        source: "iana"
      },
      "application/vnd.dvb.esgcontainer": {
        source: "iana"
      },
      "application/vnd.dvb.ipdcdftnotifaccess": {
        source: "iana"
      },
      "application/vnd.dvb.ipdcesgaccess": {
        source: "iana"
      },
      "application/vnd.dvb.ipdcesgaccess2": {
        source: "iana"
      },
      "application/vnd.dvb.ipdcesgpdd": {
        source: "iana"
      },
      "application/vnd.dvb.ipdcroaming": {
        source: "iana"
      },
      "application/vnd.dvb.iptv.alfec-base": {
        source: "iana"
      },
      "application/vnd.dvb.iptv.alfec-enhancement": {
        source: "iana"
      },
      "application/vnd.dvb.notif-aggregate-root+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-container+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-generic+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-ia-msglist+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-ia-registration-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-ia-registration-response+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-init+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.pfr": {
        source: "iana"
      },
      "application/vnd.dvb.service": {
        source: "iana",
        extensions: ["svc"]
      },
      "application/vnd.dxr": {
        source: "iana"
      },
      "application/vnd.dynageo": {
        source: "iana",
        extensions: ["geo"]
      },
      "application/vnd.dzr": {
        source: "iana"
      },
      "application/vnd.easykaraoke.cdgdownload": {
        source: "iana"
      },
      "application/vnd.ecdis-update": {
        source: "iana"
      },
      "application/vnd.ecip.rlp": {
        source: "iana"
      },
      "application/vnd.eclipse.ditto+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ecowin.chart": {
        source: "iana",
        extensions: ["mag"]
      },
      "application/vnd.ecowin.filerequest": {
        source: "iana"
      },
      "application/vnd.ecowin.fileupdate": {
        source: "iana"
      },
      "application/vnd.ecowin.series": {
        source: "iana"
      },
      "application/vnd.ecowin.seriesrequest": {
        source: "iana"
      },
      "application/vnd.ecowin.seriesupdate": {
        source: "iana"
      },
      "application/vnd.efi.img": {
        source: "iana"
      },
      "application/vnd.efi.iso": {
        source: "iana"
      },
      "application/vnd.emclient.accessrequest+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.enliven": {
        source: "iana",
        extensions: ["nml"]
      },
      "application/vnd.enphase.envoy": {
        source: "iana"
      },
      "application/vnd.eprints.data+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.epson.esf": {
        source: "iana",
        extensions: ["esf"]
      },
      "application/vnd.epson.msf": {
        source: "iana",
        extensions: ["msf"]
      },
      "application/vnd.epson.quickanime": {
        source: "iana",
        extensions: ["qam"]
      },
      "application/vnd.epson.salt": {
        source: "iana",
        extensions: ["slt"]
      },
      "application/vnd.epson.ssf": {
        source: "iana",
        extensions: ["ssf"]
      },
      "application/vnd.ericsson.quickcall": {
        source: "iana"
      },
      "application/vnd.espass-espass+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.eszigno3+xml": {
        source: "iana",
        compressible: true,
        extensions: ["es3", "et3"]
      },
      "application/vnd.etsi.aoc+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.asic-e+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.etsi.asic-s+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.etsi.cug+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvcommand+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvdiscovery+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvprofile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvsad-bc+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvsad-cod+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvsad-npvr+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvservice+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvsync+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvueprofile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.mcid+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.mheg5": {
        source: "iana"
      },
      "application/vnd.etsi.overload-control-policy-dataset+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.pstn+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.sci+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.simservs+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.timestamp-token": {
        source: "iana"
      },
      "application/vnd.etsi.tsl+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.tsl.der": {
        source: "iana"
      },
      "application/vnd.eu.kasparian.car+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.eudora.data": {
        source: "iana"
      },
      "application/vnd.evolv.ecig.profile": {
        source: "iana"
      },
      "application/vnd.evolv.ecig.settings": {
        source: "iana"
      },
      "application/vnd.evolv.ecig.theme": {
        source: "iana"
      },
      "application/vnd.exstream-empower+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.exstream-package": {
        source: "iana"
      },
      "application/vnd.ezpix-album": {
        source: "iana",
        extensions: ["ez2"]
      },
      "application/vnd.ezpix-package": {
        source: "iana",
        extensions: ["ez3"]
      },
      "application/vnd.f-secure.mobile": {
        source: "iana"
      },
      "application/vnd.familysearch.gedcom+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.fastcopy-disk-image": {
        source: "iana"
      },
      "application/vnd.fdf": {
        source: "iana",
        extensions: ["fdf"]
      },
      "application/vnd.fdsn.mseed": {
        source: "iana",
        extensions: ["mseed"]
      },
      "application/vnd.fdsn.seed": {
        source: "iana",
        extensions: ["seed", "dataless"]
      },
      "application/vnd.ffsns": {
        source: "iana"
      },
      "application/vnd.ficlab.flb+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.filmit.zfc": {
        source: "iana"
      },
      "application/vnd.fints": {
        source: "iana"
      },
      "application/vnd.firemonkeys.cloudcell": {
        source: "iana"
      },
      "application/vnd.flographit": {
        source: "iana",
        extensions: ["gph"]
      },
      "application/vnd.fluxtime.clip": {
        source: "iana",
        extensions: ["ftc"]
      },
      "application/vnd.font-fontforge-sfd": {
        source: "iana"
      },
      "application/vnd.framemaker": {
        source: "iana",
        extensions: ["fm", "frame", "maker", "book"]
      },
      "application/vnd.frogans.fnc": {
        source: "iana",
        extensions: ["fnc"]
      },
      "application/vnd.frogans.ltf": {
        source: "iana",
        extensions: ["ltf"]
      },
      "application/vnd.fsc.weblaunch": {
        source: "iana",
        extensions: ["fsc"]
      },
      "application/vnd.fujifilm.fb.docuworks": {
        source: "iana"
      },
      "application/vnd.fujifilm.fb.docuworks.binder": {
        source: "iana"
      },
      "application/vnd.fujifilm.fb.docuworks.container": {
        source: "iana"
      },
      "application/vnd.fujifilm.fb.jfi+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.fujitsu.oasys": {
        source: "iana",
        extensions: ["oas"]
      },
      "application/vnd.fujitsu.oasys2": {
        source: "iana",
        extensions: ["oa2"]
      },
      "application/vnd.fujitsu.oasys3": {
        source: "iana",
        extensions: ["oa3"]
      },
      "application/vnd.fujitsu.oasysgp": {
        source: "iana",
        extensions: ["fg5"]
      },
      "application/vnd.fujitsu.oasysprs": {
        source: "iana",
        extensions: ["bh2"]
      },
      "application/vnd.fujixerox.art-ex": {
        source: "iana"
      },
      "application/vnd.fujixerox.art4": {
        source: "iana"
      },
      "application/vnd.fujixerox.ddd": {
        source: "iana",
        extensions: ["ddd"]
      },
      "application/vnd.fujixerox.docuworks": {
        source: "iana",
        extensions: ["xdw"]
      },
      "application/vnd.fujixerox.docuworks.binder": {
        source: "iana",
        extensions: ["xbd"]
      },
      "application/vnd.fujixerox.docuworks.container": {
        source: "iana"
      },
      "application/vnd.fujixerox.hbpl": {
        source: "iana"
      },
      "application/vnd.fut-misnet": {
        source: "iana"
      },
      "application/vnd.futoin+cbor": {
        source: "iana"
      },
      "application/vnd.futoin+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.fuzzysheet": {
        source: "iana",
        extensions: ["fzs"]
      },
      "application/vnd.genomatix.tuxedo": {
        source: "iana",
        extensions: ["txd"]
      },
      "application/vnd.gentics.grd+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.geo+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.geocube+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.geogebra.file": {
        source: "iana",
        extensions: ["ggb"]
      },
      "application/vnd.geogebra.slides": {
        source: "iana"
      },
      "application/vnd.geogebra.tool": {
        source: "iana",
        extensions: ["ggt"]
      },
      "application/vnd.geometry-explorer": {
        source: "iana",
        extensions: ["gex", "gre"]
      },
      "application/vnd.geonext": {
        source: "iana",
        extensions: ["gxt"]
      },
      "application/vnd.geoplan": {
        source: "iana",
        extensions: ["g2w"]
      },
      "application/vnd.geospace": {
        source: "iana",
        extensions: ["g3w"]
      },
      "application/vnd.gerber": {
        source: "iana"
      },
      "application/vnd.globalplatform.card-content-mgt": {
        source: "iana"
      },
      "application/vnd.globalplatform.card-content-mgt-response": {
        source: "iana"
      },
      "application/vnd.gmx": {
        source: "iana",
        extensions: ["gmx"]
      },
      "application/vnd.google-apps.document": {
        compressible: false,
        extensions: ["gdoc"]
      },
      "application/vnd.google-apps.presentation": {
        compressible: false,
        extensions: ["gslides"]
      },
      "application/vnd.google-apps.spreadsheet": {
        compressible: false,
        extensions: ["gsheet"]
      },
      "application/vnd.google-earth.kml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["kml"]
      },
      "application/vnd.google-earth.kmz": {
        source: "iana",
        compressible: false,
        extensions: ["kmz"]
      },
      "application/vnd.gov.sk.e-form+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.gov.sk.e-form+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.gov.sk.xmldatacontainer+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.grafeq": {
        source: "iana",
        extensions: ["gqf", "gqs"]
      },
      "application/vnd.gridmp": {
        source: "iana"
      },
      "application/vnd.groove-account": {
        source: "iana",
        extensions: ["gac"]
      },
      "application/vnd.groove-help": {
        source: "iana",
        extensions: ["ghf"]
      },
      "application/vnd.groove-identity-message": {
        source: "iana",
        extensions: ["gim"]
      },
      "application/vnd.groove-injector": {
        source: "iana",
        extensions: ["grv"]
      },
      "application/vnd.groove-tool-message": {
        source: "iana",
        extensions: ["gtm"]
      },
      "application/vnd.groove-tool-template": {
        source: "iana",
        extensions: ["tpl"]
      },
      "application/vnd.groove-vcard": {
        source: "iana",
        extensions: ["vcg"]
      },
      "application/vnd.hal+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hal+xml": {
        source: "iana",
        compressible: true,
        extensions: ["hal"]
      },
      "application/vnd.handheld-entertainment+xml": {
        source: "iana",
        compressible: true,
        extensions: ["zmm"]
      },
      "application/vnd.hbci": {
        source: "iana",
        extensions: ["hbci"]
      },
      "application/vnd.hc+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hcl-bireports": {
        source: "iana"
      },
      "application/vnd.hdt": {
        source: "iana"
      },
      "application/vnd.heroku+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hhe.lesson-player": {
        source: "iana",
        extensions: ["les"]
      },
      "application/vnd.hl7cda+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.hl7v2+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.hp-hpgl": {
        source: "iana",
        extensions: ["hpgl"]
      },
      "application/vnd.hp-hpid": {
        source: "iana",
        extensions: ["hpid"]
      },
      "application/vnd.hp-hps": {
        source: "iana",
        extensions: ["hps"]
      },
      "application/vnd.hp-jlyt": {
        source: "iana",
        extensions: ["jlt"]
      },
      "application/vnd.hp-pcl": {
        source: "iana",
        extensions: ["pcl"]
      },
      "application/vnd.hp-pclxl": {
        source: "iana",
        extensions: ["pclxl"]
      },
      "application/vnd.httphone": {
        source: "iana"
      },
      "application/vnd.hydrostatix.sof-data": {
        source: "iana",
        extensions: ["sfd-hdstx"]
      },
      "application/vnd.hyper+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hyper-item+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hyperdrive+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hzn-3d-crossword": {
        source: "iana"
      },
      "application/vnd.ibm.afplinedata": {
        source: "iana"
      },
      "application/vnd.ibm.electronic-media": {
        source: "iana"
      },
      "application/vnd.ibm.minipay": {
        source: "iana",
        extensions: ["mpy"]
      },
      "application/vnd.ibm.modcap": {
        source: "iana",
        extensions: ["afp", "listafp", "list3820"]
      },
      "application/vnd.ibm.rights-management": {
        source: "iana",
        extensions: ["irm"]
      },
      "application/vnd.ibm.secure-container": {
        source: "iana",
        extensions: ["sc"]
      },
      "application/vnd.iccprofile": {
        source: "iana",
        extensions: ["icc", "icm"]
      },
      "application/vnd.ieee.1905": {
        source: "iana"
      },
      "application/vnd.igloader": {
        source: "iana",
        extensions: ["igl"]
      },
      "application/vnd.imagemeter.folder+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.imagemeter.image+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.immervision-ivp": {
        source: "iana",
        extensions: ["ivp"]
      },
      "application/vnd.immervision-ivu": {
        source: "iana",
        extensions: ["ivu"]
      },
      "application/vnd.ims.imsccv1p1": {
        source: "iana"
      },
      "application/vnd.ims.imsccv1p2": {
        source: "iana"
      },
      "application/vnd.ims.imsccv1p3": {
        source: "iana"
      },
      "application/vnd.ims.lis.v2.result+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ims.lti.v2.toolconsumerprofile+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ims.lti.v2.toolproxy+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ims.lti.v2.toolproxy.id+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ims.lti.v2.toolsettings+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ims.lti.v2.toolsettings.simple+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.informedcontrol.rms+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.informix-visionary": {
        source: "iana"
      },
      "application/vnd.infotech.project": {
        source: "iana"
      },
      "application/vnd.infotech.project+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.innopath.wamp.notification": {
        source: "iana"
      },
      "application/vnd.insors.igm": {
        source: "iana",
        extensions: ["igm"]
      },
      "application/vnd.intercon.formnet": {
        source: "iana",
        extensions: ["xpw", "xpx"]
      },
      "application/vnd.intergeo": {
        source: "iana",
        extensions: ["i2g"]
      },
      "application/vnd.intertrust.digibox": {
        source: "iana"
      },
      "application/vnd.intertrust.nncp": {
        source: "iana"
      },
      "application/vnd.intu.qbo": {
        source: "iana",
        extensions: ["qbo"]
      },
      "application/vnd.intu.qfx": {
        source: "iana",
        extensions: ["qfx"]
      },
      "application/vnd.iptc.g2.catalogitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.conceptitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.knowledgeitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.newsitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.newsmessage+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.packageitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.planningitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ipunplugged.rcprofile": {
        source: "iana",
        extensions: ["rcprofile"]
      },
      "application/vnd.irepository.package+xml": {
        source: "iana",
        compressible: true,
        extensions: ["irp"]
      },
      "application/vnd.is-xpr": {
        source: "iana",
        extensions: ["xpr"]
      },
      "application/vnd.isac.fcs": {
        source: "iana",
        extensions: ["fcs"]
      },
      "application/vnd.iso11783-10+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.jam": {
        source: "iana",
        extensions: ["jam"]
      },
      "application/vnd.japannet-directory-service": {
        source: "iana"
      },
      "application/vnd.japannet-jpnstore-wakeup": {
        source: "iana"
      },
      "application/vnd.japannet-payment-wakeup": {
        source: "iana"
      },
      "application/vnd.japannet-registration": {
        source: "iana"
      },
      "application/vnd.japannet-registration-wakeup": {
        source: "iana"
      },
      "application/vnd.japannet-setstore-wakeup": {
        source: "iana"
      },
      "application/vnd.japannet-verification": {
        source: "iana"
      },
      "application/vnd.japannet-verification-wakeup": {
        source: "iana"
      },
      "application/vnd.jcp.javame.midlet-rms": {
        source: "iana",
        extensions: ["rms"]
      },
      "application/vnd.jisp": {
        source: "iana",
        extensions: ["jisp"]
      },
      "application/vnd.joost.joda-archive": {
        source: "iana",
        extensions: ["joda"]
      },
      "application/vnd.jsk.isdn-ngn": {
        source: "iana"
      },
      "application/vnd.kahootz": {
        source: "iana",
        extensions: ["ktz", "ktr"]
      },
      "application/vnd.kde.karbon": {
        source: "iana",
        extensions: ["karbon"]
      },
      "application/vnd.kde.kchart": {
        source: "iana",
        extensions: ["chrt"]
      },
      "application/vnd.kde.kformula": {
        source: "iana",
        extensions: ["kfo"]
      },
      "application/vnd.kde.kivio": {
        source: "iana",
        extensions: ["flw"]
      },
      "application/vnd.kde.kontour": {
        source: "iana",
        extensions: ["kon"]
      },
      "application/vnd.kde.kpresenter": {
        source: "iana",
        extensions: ["kpr", "kpt"]
      },
      "application/vnd.kde.kspread": {
        source: "iana",
        extensions: ["ksp"]
      },
      "application/vnd.kde.kword": {
        source: "iana",
        extensions: ["kwd", "kwt"]
      },
      "application/vnd.kenameaapp": {
        source: "iana",
        extensions: ["htke"]
      },
      "application/vnd.kidspiration": {
        source: "iana",
        extensions: ["kia"]
      },
      "application/vnd.kinar": {
        source: "iana",
        extensions: ["kne", "knp"]
      },
      "application/vnd.koan": {
        source: "iana",
        extensions: ["skp", "skd", "skt", "skm"]
      },
      "application/vnd.kodak-descriptor": {
        source: "iana",
        extensions: ["sse"]
      },
      "application/vnd.las": {
        source: "iana"
      },
      "application/vnd.las.las+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.las.las+xml": {
        source: "iana",
        compressible: true,
        extensions: ["lasxml"]
      },
      "application/vnd.laszip": {
        source: "iana"
      },
      "application/vnd.leap+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.liberty-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.llamagraphics.life-balance.desktop": {
        source: "iana",
        extensions: ["lbd"]
      },
      "application/vnd.llamagraphics.life-balance.exchange+xml": {
        source: "iana",
        compressible: true,
        extensions: ["lbe"]
      },
      "application/vnd.logipipe.circuit+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.loom": {
        source: "iana"
      },
      "application/vnd.lotus-1-2-3": {
        source: "iana",
        extensions: ["123"]
      },
      "application/vnd.lotus-approach": {
        source: "iana",
        extensions: ["apr"]
      },
      "application/vnd.lotus-freelance": {
        source: "iana",
        extensions: ["pre"]
      },
      "application/vnd.lotus-notes": {
        source: "iana",
        extensions: ["nsf"]
      },
      "application/vnd.lotus-organizer": {
        source: "iana",
        extensions: ["org"]
      },
      "application/vnd.lotus-screencam": {
        source: "iana",
        extensions: ["scm"]
      },
      "application/vnd.lotus-wordpro": {
        source: "iana",
        extensions: ["lwp"]
      },
      "application/vnd.macports.portpkg": {
        source: "iana",
        extensions: ["portpkg"]
      },
      "application/vnd.mapbox-vector-tile": {
        source: "iana",
        extensions: ["mvt"]
      },
      "application/vnd.marlin.drm.actiontoken+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.marlin.drm.conftoken+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.marlin.drm.license+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.marlin.drm.mdcf": {
        source: "iana"
      },
      "application/vnd.mason+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.maxar.archive.3tz+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.maxmind.maxmind-db": {
        source: "iana"
      },
      "application/vnd.mcd": {
        source: "iana",
        extensions: ["mcd"]
      },
      "application/vnd.medcalcdata": {
        source: "iana",
        extensions: ["mc1"]
      },
      "application/vnd.mediastation.cdkey": {
        source: "iana",
        extensions: ["cdkey"]
      },
      "application/vnd.meridian-slingshot": {
        source: "iana"
      },
      "application/vnd.mfer": {
        source: "iana",
        extensions: ["mwf"]
      },
      "application/vnd.mfmp": {
        source: "iana",
        extensions: ["mfm"]
      },
      "application/vnd.micro+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.micrografx.flo": {
        source: "iana",
        extensions: ["flo"]
      },
      "application/vnd.micrografx.igx": {
        source: "iana",
        extensions: ["igx"]
      },
      "application/vnd.microsoft.portable-executable": {
        source: "iana"
      },
      "application/vnd.microsoft.windows.thumbnail-cache": {
        source: "iana"
      },
      "application/vnd.miele+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.mif": {
        source: "iana",
        extensions: ["mif"]
      },
      "application/vnd.minisoft-hp3000-save": {
        source: "iana"
      },
      "application/vnd.mitsubishi.misty-guard.trustweb": {
        source: "iana"
      },
      "application/vnd.mobius.daf": {
        source: "iana",
        extensions: ["daf"]
      },
      "application/vnd.mobius.dis": {
        source: "iana",
        extensions: ["dis"]
      },
      "application/vnd.mobius.mbk": {
        source: "iana",
        extensions: ["mbk"]
      },
      "application/vnd.mobius.mqy": {
        source: "iana",
        extensions: ["mqy"]
      },
      "application/vnd.mobius.msl": {
        source: "iana",
        extensions: ["msl"]
      },
      "application/vnd.mobius.plc": {
        source: "iana",
        extensions: ["plc"]
      },
      "application/vnd.mobius.txf": {
        source: "iana",
        extensions: ["txf"]
      },
      "application/vnd.mophun.application": {
        source: "iana",
        extensions: ["mpn"]
      },
      "application/vnd.mophun.certificate": {
        source: "iana",
        extensions: ["mpc"]
      },
      "application/vnd.motorola.flexsuite": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.adsi": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.fis": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.gotap": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.kmr": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.ttc": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.wem": {
        source: "iana"
      },
      "application/vnd.motorola.iprm": {
        source: "iana"
      },
      "application/vnd.mozilla.xul+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xul"]
      },
      "application/vnd.ms-3mfdocument": {
        source: "iana"
      },
      "application/vnd.ms-artgalry": {
        source: "iana",
        extensions: ["cil"]
      },
      "application/vnd.ms-asf": {
        source: "iana"
      },
      "application/vnd.ms-cab-compressed": {
        source: "iana",
        extensions: ["cab"]
      },
      "application/vnd.ms-color.iccprofile": {
        source: "apache"
      },
      "application/vnd.ms-excel": {
        source: "iana",
        compressible: false,
        extensions: ["xls", "xlm", "xla", "xlc", "xlt", "xlw"]
      },
      "application/vnd.ms-excel.addin.macroenabled.12": {
        source: "iana",
        extensions: ["xlam"]
      },
      "application/vnd.ms-excel.sheet.binary.macroenabled.12": {
        source: "iana",
        extensions: ["xlsb"]
      },
      "application/vnd.ms-excel.sheet.macroenabled.12": {
        source: "iana",
        extensions: ["xlsm"]
      },
      "application/vnd.ms-excel.template.macroenabled.12": {
        source: "iana",
        extensions: ["xltm"]
      },
      "application/vnd.ms-fontobject": {
        source: "iana",
        compressible: true,
        extensions: ["eot"]
      },
      "application/vnd.ms-htmlhelp": {
        source: "iana",
        extensions: ["chm"]
      },
      "application/vnd.ms-ims": {
        source: "iana",
        extensions: ["ims"]
      },
      "application/vnd.ms-lrm": {
        source: "iana",
        extensions: ["lrm"]
      },
      "application/vnd.ms-office.activex+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ms-officetheme": {
        source: "iana",
        extensions: ["thmx"]
      },
      "application/vnd.ms-opentype": {
        source: "apache",
        compressible: true
      },
      "application/vnd.ms-outlook": {
        compressible: false,
        extensions: ["msg"]
      },
      "application/vnd.ms-package.obfuscated-opentype": {
        source: "apache"
      },
      "application/vnd.ms-pki.seccat": {
        source: "apache",
        extensions: ["cat"]
      },
      "application/vnd.ms-pki.stl": {
        source: "apache",
        extensions: ["stl"]
      },
      "application/vnd.ms-playready.initiator+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ms-powerpoint": {
        source: "iana",
        compressible: false,
        extensions: ["ppt", "pps", "pot"]
      },
      "application/vnd.ms-powerpoint.addin.macroenabled.12": {
        source: "iana",
        extensions: ["ppam"]
      },
      "application/vnd.ms-powerpoint.presentation.macroenabled.12": {
        source: "iana",
        extensions: ["pptm"]
      },
      "application/vnd.ms-powerpoint.slide.macroenabled.12": {
        source: "iana",
        extensions: ["sldm"]
      },
      "application/vnd.ms-powerpoint.slideshow.macroenabled.12": {
        source: "iana",
        extensions: ["ppsm"]
      },
      "application/vnd.ms-powerpoint.template.macroenabled.12": {
        source: "iana",
        extensions: ["potm"]
      },
      "application/vnd.ms-printdevicecapabilities+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ms-printing.printticket+xml": {
        source: "apache",
        compressible: true
      },
      "application/vnd.ms-printschematicket+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ms-project": {
        source: "iana",
        extensions: ["mpp", "mpt"]
      },
      "application/vnd.ms-tnef": {
        source: "iana"
      },
      "application/vnd.ms-windows.devicepairing": {
        source: "iana"
      },
      "application/vnd.ms-windows.nwprinting.oob": {
        source: "iana"
      },
      "application/vnd.ms-windows.printerpairing": {
        source: "iana"
      },
      "application/vnd.ms-windows.wsd.oob": {
        source: "iana"
      },
      "application/vnd.ms-wmdrm.lic-chlg-req": {
        source: "iana"
      },
      "application/vnd.ms-wmdrm.lic-resp": {
        source: "iana"
      },
      "application/vnd.ms-wmdrm.meter-chlg-req": {
        source: "iana"
      },
      "application/vnd.ms-wmdrm.meter-resp": {
        source: "iana"
      },
      "application/vnd.ms-word.document.macroenabled.12": {
        source: "iana",
        extensions: ["docm"]
      },
      "application/vnd.ms-word.template.macroenabled.12": {
        source: "iana",
        extensions: ["dotm"]
      },
      "application/vnd.ms-works": {
        source: "iana",
        extensions: ["wps", "wks", "wcm", "wdb"]
      },
      "application/vnd.ms-wpl": {
        source: "iana",
        extensions: ["wpl"]
      },
      "application/vnd.ms-xpsdocument": {
        source: "iana",
        compressible: false,
        extensions: ["xps"]
      },
      "application/vnd.msa-disk-image": {
        source: "iana"
      },
      "application/vnd.mseq": {
        source: "iana",
        extensions: ["mseq"]
      },
      "application/vnd.msign": {
        source: "iana"
      },
      "application/vnd.multiad.creator": {
        source: "iana"
      },
      "application/vnd.multiad.creator.cif": {
        source: "iana"
      },
      "application/vnd.music-niff": {
        source: "iana"
      },
      "application/vnd.musician": {
        source: "iana",
        extensions: ["mus"]
      },
      "application/vnd.muvee.style": {
        source: "iana",
        extensions: ["msty"]
      },
      "application/vnd.mynfc": {
        source: "iana",
        extensions: ["taglet"]
      },
      "application/vnd.nacamar.ybrid+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ncd.control": {
        source: "iana"
      },
      "application/vnd.ncd.reference": {
        source: "iana"
      },
      "application/vnd.nearst.inv+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nebumind.line": {
        source: "iana"
      },
      "application/vnd.nervana": {
        source: "iana"
      },
      "application/vnd.netfpx": {
        source: "iana"
      },
      "application/vnd.neurolanguage.nlu": {
        source: "iana",
        extensions: ["nlu"]
      },
      "application/vnd.nimn": {
        source: "iana"
      },
      "application/vnd.nintendo.nitro.rom": {
        source: "iana"
      },
      "application/vnd.nintendo.snes.rom": {
        source: "iana"
      },
      "application/vnd.nitf": {
        source: "iana",
        extensions: ["ntf", "nitf"]
      },
      "application/vnd.noblenet-directory": {
        source: "iana",
        extensions: ["nnd"]
      },
      "application/vnd.noblenet-sealer": {
        source: "iana",
        extensions: ["nns"]
      },
      "application/vnd.noblenet-web": {
        source: "iana",
        extensions: ["nnw"]
      },
      "application/vnd.nokia.catalogs": {
        source: "iana"
      },
      "application/vnd.nokia.conml+wbxml": {
        source: "iana"
      },
      "application/vnd.nokia.conml+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nokia.iptv.config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nokia.isds-radio-presets": {
        source: "iana"
      },
      "application/vnd.nokia.landmark+wbxml": {
        source: "iana"
      },
      "application/vnd.nokia.landmark+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nokia.landmarkcollection+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nokia.n-gage.ac+xml": {
        source: "iana",
        compressible: true,
        extensions: ["ac"]
      },
      "application/vnd.nokia.n-gage.data": {
        source: "iana",
        extensions: ["ngdat"]
      },
      "application/vnd.nokia.n-gage.symbian.install": {
        source: "iana",
        extensions: ["n-gage"]
      },
      "application/vnd.nokia.ncd": {
        source: "iana"
      },
      "application/vnd.nokia.pcd+wbxml": {
        source: "iana"
      },
      "application/vnd.nokia.pcd+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nokia.radio-preset": {
        source: "iana",
        extensions: ["rpst"]
      },
      "application/vnd.nokia.radio-presets": {
        source: "iana",
        extensions: ["rpss"]
      },
      "application/vnd.novadigm.edm": {
        source: "iana",
        extensions: ["edm"]
      },
      "application/vnd.novadigm.edx": {
        source: "iana",
        extensions: ["edx"]
      },
      "application/vnd.novadigm.ext": {
        source: "iana",
        extensions: ["ext"]
      },
      "application/vnd.ntt-local.content-share": {
        source: "iana"
      },
      "application/vnd.ntt-local.file-transfer": {
        source: "iana"
      },
      "application/vnd.ntt-local.ogw_remote-access": {
        source: "iana"
      },
      "application/vnd.ntt-local.sip-ta_remote": {
        source: "iana"
      },
      "application/vnd.ntt-local.sip-ta_tcp_stream": {
        source: "iana"
      },
      "application/vnd.oasis.opendocument.chart": {
        source: "iana",
        extensions: ["odc"]
      },
      "application/vnd.oasis.opendocument.chart-template": {
        source: "iana",
        extensions: ["otc"]
      },
      "application/vnd.oasis.opendocument.database": {
        source: "iana",
        extensions: ["odb"]
      },
      "application/vnd.oasis.opendocument.formula": {
        source: "iana",
        extensions: ["odf"]
      },
      "application/vnd.oasis.opendocument.formula-template": {
        source: "iana",
        extensions: ["odft"]
      },
      "application/vnd.oasis.opendocument.graphics": {
        source: "iana",
        compressible: false,
        extensions: ["odg"]
      },
      "application/vnd.oasis.opendocument.graphics-template": {
        source: "iana",
        extensions: ["otg"]
      },
      "application/vnd.oasis.opendocument.image": {
        source: "iana",
        extensions: ["odi"]
      },
      "application/vnd.oasis.opendocument.image-template": {
        source: "iana",
        extensions: ["oti"]
      },
      "application/vnd.oasis.opendocument.presentation": {
        source: "iana",
        compressible: false,
        extensions: ["odp"]
      },
      "application/vnd.oasis.opendocument.presentation-template": {
        source: "iana",
        extensions: ["otp"]
      },
      "application/vnd.oasis.opendocument.spreadsheet": {
        source: "iana",
        compressible: false,
        extensions: ["ods"]
      },
      "application/vnd.oasis.opendocument.spreadsheet-template": {
        source: "iana",
        extensions: ["ots"]
      },
      "application/vnd.oasis.opendocument.text": {
        source: "iana",
        compressible: false,
        extensions: ["odt"]
      },
      "application/vnd.oasis.opendocument.text-master": {
        source: "iana",
        extensions: ["odm"]
      },
      "application/vnd.oasis.opendocument.text-template": {
        source: "iana",
        extensions: ["ott"]
      },
      "application/vnd.oasis.opendocument.text-web": {
        source: "iana",
        extensions: ["oth"]
      },
      "application/vnd.obn": {
        source: "iana"
      },
      "application/vnd.ocf+cbor": {
        source: "iana"
      },
      "application/vnd.oci.image.manifest.v1+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oftn.l10n+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.contentaccessdownload+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.contentaccessstreaming+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.cspg-hexbinary": {
        source: "iana"
      },
      "application/vnd.oipf.dae.svg+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.dae.xhtml+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.mippvcontrolmessage+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.pae.gem": {
        source: "iana"
      },
      "application/vnd.oipf.spdiscovery+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.spdlist+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.ueprofile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.userprofile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.olpc-sugar": {
        source: "iana",
        extensions: ["xo"]
      },
      "application/vnd.oma-scws-config": {
        source: "iana"
      },
      "application/vnd.oma-scws-http-request": {
        source: "iana"
      },
      "application/vnd.oma-scws-http-response": {
        source: "iana"
      },
      "application/vnd.oma.bcast.associated-procedure-parameter+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.drm-trigger+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.imd+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.ltkm": {
        source: "iana"
      },
      "application/vnd.oma.bcast.notification+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.provisioningtrigger": {
        source: "iana"
      },
      "application/vnd.oma.bcast.sgboot": {
        source: "iana"
      },
      "application/vnd.oma.bcast.sgdd+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.sgdu": {
        source: "iana"
      },
      "application/vnd.oma.bcast.simple-symbol-container": {
        source: "iana"
      },
      "application/vnd.oma.bcast.smartcard-trigger+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.sprov+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.stkm": {
        source: "iana"
      },
      "application/vnd.oma.cab-address-book+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.cab-feature-handler+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.cab-pcc+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.cab-subs-invite+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.cab-user-prefs+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.dcd": {
        source: "iana"
      },
      "application/vnd.oma.dcdc": {
        source: "iana"
      },
      "application/vnd.oma.dd2+xml": {
        source: "iana",
        compressible: true,
        extensions: ["dd2"]
      },
      "application/vnd.oma.drm.risd+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.group-usage-list+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.lwm2m+cbor": {
        source: "iana"
      },
      "application/vnd.oma.lwm2m+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.lwm2m+tlv": {
        source: "iana"
      },
      "application/vnd.oma.pal+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.poc.detailed-progress-report+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.poc.final-report+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.poc.groups+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.poc.invocation-descriptor+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.poc.optimized-progress-report+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.push": {
        source: "iana"
      },
      "application/vnd.oma.scidm.messages+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.xcap-directory+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.omads-email+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.omads-file+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.omads-folder+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.omaloc-supl-init": {
        source: "iana"
      },
      "application/vnd.onepager": {
        source: "iana"
      },
      "application/vnd.onepagertamp": {
        source: "iana"
      },
      "application/vnd.onepagertamx": {
        source: "iana"
      },
      "application/vnd.onepagertat": {
        source: "iana"
      },
      "application/vnd.onepagertatp": {
        source: "iana"
      },
      "application/vnd.onepagertatx": {
        source: "iana"
      },
      "application/vnd.openblox.game+xml": {
        source: "iana",
        compressible: true,
        extensions: ["obgx"]
      },
      "application/vnd.openblox.game-binary": {
        source: "iana"
      },
      "application/vnd.openeye.oeb": {
        source: "iana"
      },
      "application/vnd.openofficeorg.extension": {
        source: "apache",
        extensions: ["oxt"]
      },
      "application/vnd.openstreetmap.data+xml": {
        source: "iana",
        compressible: true,
        extensions: ["osm"]
      },
      "application/vnd.opentimestamps.ots": {
        source: "iana"
      },
      "application/vnd.openxmlformats-officedocument.custom-properties+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.customxmlproperties+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawing+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.chart+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.diagramcolors+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.diagramdata+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.diagramlayout+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.diagramstyle+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.extended-properties+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.commentauthors+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.comments+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.handoutmaster+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.notesmaster+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.notesslide+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
        source: "iana",
        compressible: false,
        extensions: ["pptx"]
      },
      "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.presprops+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slide": {
        source: "iana",
        extensions: ["sldx"]
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slide+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slidelayout+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slidemaster+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slideshow": {
        source: "iana",
        extensions: ["ppsx"]
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slideupdateinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.tablestyles+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.tags+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.template": {
        source: "iana",
        extensions: ["potx"]
      },
      "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.viewprops+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.calcchain+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.dialogsheet+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.externallink+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcachedefinition+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcacherecords+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.pivottable+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.querytable+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionheaders+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionlog+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedstrings+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
        source: "iana",
        compressible: false,
        extensions: ["xlsx"]
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetmetadata+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.tablesinglecells+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.template": {
        source: "iana",
        extensions: ["xltx"]
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.usernames+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.volatiledependencies+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.theme+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.themeoverride+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.vmldrawing": {
        source: "iana"
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
        source: "iana",
        compressible: false,
        extensions: ["docx"]
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.fonttable+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.template": {
        source: "iana",
        extensions: ["dotx"]
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.websettings+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-package.core-properties+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-package.relationships+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oracle.resource+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.orange.indata": {
        source: "iana"
      },
      "application/vnd.osa.netdeploy": {
        source: "iana"
      },
      "application/vnd.osgeo.mapguide.package": {
        source: "iana",
        extensions: ["mgp"]
      },
      "application/vnd.osgi.bundle": {
        source: "iana"
      },
      "application/vnd.osgi.dp": {
        source: "iana",
        extensions: ["dp"]
      },
      "application/vnd.osgi.subsystem": {
        source: "iana",
        extensions: ["esa"]
      },
      "application/vnd.otps.ct-kip+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oxli.countgraph": {
        source: "iana"
      },
      "application/vnd.pagerduty+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.palm": {
        source: "iana",
        extensions: ["pdb", "pqa", "oprc"]
      },
      "application/vnd.panoply": {
        source: "iana"
      },
      "application/vnd.paos.xml": {
        source: "iana"
      },
      "application/vnd.patentdive": {
        source: "iana"
      },
      "application/vnd.patientecommsdoc": {
        source: "iana"
      },
      "application/vnd.pawaafile": {
        source: "iana",
        extensions: ["paw"]
      },
      "application/vnd.pcos": {
        source: "iana"
      },
      "application/vnd.pg.format": {
        source: "iana",
        extensions: ["str"]
      },
      "application/vnd.pg.osasli": {
        source: "iana",
        extensions: ["ei6"]
      },
      "application/vnd.piaccess.application-licence": {
        source: "iana"
      },
      "application/vnd.picsel": {
        source: "iana",
        extensions: ["efif"]
      },
      "application/vnd.pmi.widget": {
        source: "iana",
        extensions: ["wg"]
      },
      "application/vnd.poc.group-advertisement+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.pocketlearn": {
        source: "iana",
        extensions: ["plf"]
      },
      "application/vnd.powerbuilder6": {
        source: "iana",
        extensions: ["pbd"]
      },
      "application/vnd.powerbuilder6-s": {
        source: "iana"
      },
      "application/vnd.powerbuilder7": {
        source: "iana"
      },
      "application/vnd.powerbuilder7-s": {
        source: "iana"
      },
      "application/vnd.powerbuilder75": {
        source: "iana"
      },
      "application/vnd.powerbuilder75-s": {
        source: "iana"
      },
      "application/vnd.preminet": {
        source: "iana"
      },
      "application/vnd.previewsystems.box": {
        source: "iana",
        extensions: ["box"]
      },
      "application/vnd.proteus.magazine": {
        source: "iana",
        extensions: ["mgz"]
      },
      "application/vnd.psfs": {
        source: "iana"
      },
      "application/vnd.publishare-delta-tree": {
        source: "iana",
        extensions: ["qps"]
      },
      "application/vnd.pvi.ptid1": {
        source: "iana",
        extensions: ["ptid"]
      },
      "application/vnd.pwg-multiplexed": {
        source: "iana"
      },
      "application/vnd.pwg-xhtml-print+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.qualcomm.brew-app-res": {
        source: "iana"
      },
      "application/vnd.quarantainenet": {
        source: "iana"
      },
      "application/vnd.quark.quarkxpress": {
        source: "iana",
        extensions: ["qxd", "qxt", "qwd", "qwt", "qxl", "qxb"]
      },
      "application/vnd.quobject-quoxdocument": {
        source: "iana"
      },
      "application/vnd.radisys.moml+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-audit+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-audit-conf+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-audit-conn+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-audit-dialog+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-audit-stream+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-conf+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-base+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-fax-detect+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-fax-sendrecv+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-group+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-speech+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-transform+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.rainstor.data": {
        source: "iana"
      },
      "application/vnd.rapid": {
        source: "iana"
      },
      "application/vnd.rar": {
        source: "iana",
        extensions: ["rar"]
      },
      "application/vnd.realvnc.bed": {
        source: "iana",
        extensions: ["bed"]
      },
      "application/vnd.recordare.musicxml": {
        source: "iana",
        extensions: ["mxl"]
      },
      "application/vnd.recordare.musicxml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["musicxml"]
      },
      "application/vnd.renlearn.rlprint": {
        source: "iana"
      },
      "application/vnd.resilient.logic": {
        source: "iana"
      },
      "application/vnd.restful+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.rig.cryptonote": {
        source: "iana",
        extensions: ["cryptonote"]
      },
      "application/vnd.rim.cod": {
        source: "apache",
        extensions: ["cod"]
      },
      "application/vnd.rn-realmedia": {
        source: "apache",
        extensions: ["rm"]
      },
      "application/vnd.rn-realmedia-vbr": {
        source: "apache",
        extensions: ["rmvb"]
      },
      "application/vnd.route66.link66+xml": {
        source: "iana",
        compressible: true,
        extensions: ["link66"]
      },
      "application/vnd.rs-274x": {
        source: "iana"
      },
      "application/vnd.ruckus.download": {
        source: "iana"
      },
      "application/vnd.s3sms": {
        source: "iana"
      },
      "application/vnd.sailingtracker.track": {
        source: "iana",
        extensions: ["st"]
      },
      "application/vnd.sar": {
        source: "iana"
      },
      "application/vnd.sbm.cid": {
        source: "iana"
      },
      "application/vnd.sbm.mid2": {
        source: "iana"
      },
      "application/vnd.scribus": {
        source: "iana"
      },
      "application/vnd.sealed.3df": {
        source: "iana"
      },
      "application/vnd.sealed.csf": {
        source: "iana"
      },
      "application/vnd.sealed.doc": {
        source: "iana"
      },
      "application/vnd.sealed.eml": {
        source: "iana"
      },
      "application/vnd.sealed.mht": {
        source: "iana"
      },
      "application/vnd.sealed.net": {
        source: "iana"
      },
      "application/vnd.sealed.ppt": {
        source: "iana"
      },
      "application/vnd.sealed.tiff": {
        source: "iana"
      },
      "application/vnd.sealed.xls": {
        source: "iana"
      },
      "application/vnd.sealedmedia.softseal.html": {
        source: "iana"
      },
      "application/vnd.sealedmedia.softseal.pdf": {
        source: "iana"
      },
      "application/vnd.seemail": {
        source: "iana",
        extensions: ["see"]
      },
      "application/vnd.seis+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.sema": {
        source: "iana",
        extensions: ["sema"]
      },
      "application/vnd.semd": {
        source: "iana",
        extensions: ["semd"]
      },
      "application/vnd.semf": {
        source: "iana",
        extensions: ["semf"]
      },
      "application/vnd.shade-save-file": {
        source: "iana"
      },
      "application/vnd.shana.informed.formdata": {
        source: "iana",
        extensions: ["ifm"]
      },
      "application/vnd.shana.informed.formtemplate": {
        source: "iana",
        extensions: ["itp"]
      },
      "application/vnd.shana.informed.interchange": {
        source: "iana",
        extensions: ["iif"]
      },
      "application/vnd.shana.informed.package": {
        source: "iana",
        extensions: ["ipk"]
      },
      "application/vnd.shootproof+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.shopkick+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.shp": {
        source: "iana"
      },
      "application/vnd.shx": {
        source: "iana"
      },
      "application/vnd.sigrok.session": {
        source: "iana"
      },
      "application/vnd.simtech-mindmapper": {
        source: "iana",
        extensions: ["twd", "twds"]
      },
      "application/vnd.siren+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.smaf": {
        source: "iana",
        extensions: ["mmf"]
      },
      "application/vnd.smart.notebook": {
        source: "iana"
      },
      "application/vnd.smart.teacher": {
        source: "iana",
        extensions: ["teacher"]
      },
      "application/vnd.snesdev-page-table": {
        source: "iana"
      },
      "application/vnd.software602.filler.form+xml": {
        source: "iana",
        compressible: true,
        extensions: ["fo"]
      },
      "application/vnd.software602.filler.form-xml-zip": {
        source: "iana"
      },
      "application/vnd.solent.sdkm+xml": {
        source: "iana",
        compressible: true,
        extensions: ["sdkm", "sdkd"]
      },
      "application/vnd.spotfire.dxp": {
        source: "iana",
        extensions: ["dxp"]
      },
      "application/vnd.spotfire.sfs": {
        source: "iana",
        extensions: ["sfs"]
      },
      "application/vnd.sqlite3": {
        source: "iana"
      },
      "application/vnd.sss-cod": {
        source: "iana"
      },
      "application/vnd.sss-dtf": {
        source: "iana"
      },
      "application/vnd.sss-ntf": {
        source: "iana"
      },
      "application/vnd.stardivision.calc": {
        source: "apache",
        extensions: ["sdc"]
      },
      "application/vnd.stardivision.draw": {
        source: "apache",
        extensions: ["sda"]
      },
      "application/vnd.stardivision.impress": {
        source: "apache",
        extensions: ["sdd"]
      },
      "application/vnd.stardivision.math": {
        source: "apache",
        extensions: ["smf"]
      },
      "application/vnd.stardivision.writer": {
        source: "apache",
        extensions: ["sdw", "vor"]
      },
      "application/vnd.stardivision.writer-global": {
        source: "apache",
        extensions: ["sgl"]
      },
      "application/vnd.stepmania.package": {
        source: "iana",
        extensions: ["smzip"]
      },
      "application/vnd.stepmania.stepchart": {
        source: "iana",
        extensions: ["sm"]
      },
      "application/vnd.street-stream": {
        source: "iana"
      },
      "application/vnd.sun.wadl+xml": {
        source: "iana",
        compressible: true,
        extensions: ["wadl"]
      },
      "application/vnd.sun.xml.calc": {
        source: "apache",
        extensions: ["sxc"]
      },
      "application/vnd.sun.xml.calc.template": {
        source: "apache",
        extensions: ["stc"]
      },
      "application/vnd.sun.xml.draw": {
        source: "apache",
        extensions: ["sxd"]
      },
      "application/vnd.sun.xml.draw.template": {
        source: "apache",
        extensions: ["std"]
      },
      "application/vnd.sun.xml.impress": {
        source: "apache",
        extensions: ["sxi"]
      },
      "application/vnd.sun.xml.impress.template": {
        source: "apache",
        extensions: ["sti"]
      },
      "application/vnd.sun.xml.math": {
        source: "apache",
        extensions: ["sxm"]
      },
      "application/vnd.sun.xml.writer": {
        source: "apache",
        extensions: ["sxw"]
      },
      "application/vnd.sun.xml.writer.global": {
        source: "apache",
        extensions: ["sxg"]
      },
      "application/vnd.sun.xml.writer.template": {
        source: "apache",
        extensions: ["stw"]
      },
      "application/vnd.sus-calendar": {
        source: "iana",
        extensions: ["sus", "susp"]
      },
      "application/vnd.svd": {
        source: "iana",
        extensions: ["svd"]
      },
      "application/vnd.swiftview-ics": {
        source: "iana"
      },
      "application/vnd.sycle+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.syft+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.symbian.install": {
        source: "apache",
        extensions: ["sis", "sisx"]
      },
      "application/vnd.syncml+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["xsm"]
      },
      "application/vnd.syncml.dm+wbxml": {
        source: "iana",
        charset: "UTF-8",
        extensions: ["bdm"]
      },
      "application/vnd.syncml.dm+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["xdm"]
      },
      "application/vnd.syncml.dm.notification": {
        source: "iana"
      },
      "application/vnd.syncml.dmddf+wbxml": {
        source: "iana"
      },
      "application/vnd.syncml.dmddf+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["ddf"]
      },
      "application/vnd.syncml.dmtnds+wbxml": {
        source: "iana"
      },
      "application/vnd.syncml.dmtnds+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.syncml.ds.notification": {
        source: "iana"
      },
      "application/vnd.tableschema+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.tao.intent-module-archive": {
        source: "iana",
        extensions: ["tao"]
      },
      "application/vnd.tcpdump.pcap": {
        source: "iana",
        extensions: ["pcap", "cap", "dmp"]
      },
      "application/vnd.think-cell.ppttc+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.tmd.mediaflex.api+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.tml": {
        source: "iana"
      },
      "application/vnd.tmobile-livetv": {
        source: "iana",
        extensions: ["tmo"]
      },
      "application/vnd.tri.onesource": {
        source: "iana"
      },
      "application/vnd.trid.tpt": {
        source: "iana",
        extensions: ["tpt"]
      },
      "application/vnd.triscape.mxs": {
        source: "iana",
        extensions: ["mxs"]
      },
      "application/vnd.trueapp": {
        source: "iana",
        extensions: ["tra"]
      },
      "application/vnd.truedoc": {
        source: "iana"
      },
      "application/vnd.ubisoft.webplayer": {
        source: "iana"
      },
      "application/vnd.ufdl": {
        source: "iana",
        extensions: ["ufd", "ufdl"]
      },
      "application/vnd.uiq.theme": {
        source: "iana",
        extensions: ["utz"]
      },
      "application/vnd.umajin": {
        source: "iana",
        extensions: ["umj"]
      },
      "application/vnd.unity": {
        source: "iana",
        extensions: ["unityweb"]
      },
      "application/vnd.uoml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["uoml"]
      },
      "application/vnd.uplanet.alert": {
        source: "iana"
      },
      "application/vnd.uplanet.alert-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.bearer-choice": {
        source: "iana"
      },
      "application/vnd.uplanet.bearer-choice-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.cacheop": {
        source: "iana"
      },
      "application/vnd.uplanet.cacheop-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.channel": {
        source: "iana"
      },
      "application/vnd.uplanet.channel-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.list": {
        source: "iana"
      },
      "application/vnd.uplanet.list-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.listcmd": {
        source: "iana"
      },
      "application/vnd.uplanet.listcmd-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.signal": {
        source: "iana"
      },
      "application/vnd.uri-map": {
        source: "iana"
      },
      "application/vnd.valve.source.material": {
        source: "iana"
      },
      "application/vnd.vcx": {
        source: "iana",
        extensions: ["vcx"]
      },
      "application/vnd.vd-study": {
        source: "iana"
      },
      "application/vnd.vectorworks": {
        source: "iana"
      },
      "application/vnd.vel+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.verimatrix.vcas": {
        source: "iana"
      },
      "application/vnd.veritone.aion+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.veryant.thin": {
        source: "iana"
      },
      "application/vnd.ves.encrypted": {
        source: "iana"
      },
      "application/vnd.vidsoft.vidconference": {
        source: "iana"
      },
      "application/vnd.visio": {
        source: "iana",
        extensions: ["vsd", "vst", "vss", "vsw"]
      },
      "application/vnd.visionary": {
        source: "iana",
        extensions: ["vis"]
      },
      "application/vnd.vividence.scriptfile": {
        source: "iana"
      },
      "application/vnd.vsf": {
        source: "iana",
        extensions: ["vsf"]
      },
      "application/vnd.wap.sic": {
        source: "iana"
      },
      "application/vnd.wap.slc": {
        source: "iana"
      },
      "application/vnd.wap.wbxml": {
        source: "iana",
        charset: "UTF-8",
        extensions: ["wbxml"]
      },
      "application/vnd.wap.wmlc": {
        source: "iana",
        extensions: ["wmlc"]
      },
      "application/vnd.wap.wmlscriptc": {
        source: "iana",
        extensions: ["wmlsc"]
      },
      "application/vnd.webturbo": {
        source: "iana",
        extensions: ["wtb"]
      },
      "application/vnd.wfa.dpp": {
        source: "iana"
      },
      "application/vnd.wfa.p2p": {
        source: "iana"
      },
      "application/vnd.wfa.wsc": {
        source: "iana"
      },
      "application/vnd.windows.devicepairing": {
        source: "iana"
      },
      "application/vnd.wmc": {
        source: "iana"
      },
      "application/vnd.wmf.bootstrap": {
        source: "iana"
      },
      "application/vnd.wolfram.mathematica": {
        source: "iana"
      },
      "application/vnd.wolfram.mathematica.package": {
        source: "iana"
      },
      "application/vnd.wolfram.player": {
        source: "iana",
        extensions: ["nbp"]
      },
      "application/vnd.wordperfect": {
        source: "iana",
        extensions: ["wpd"]
      },
      "application/vnd.wqd": {
        source: "iana",
        extensions: ["wqd"]
      },
      "application/vnd.wrq-hp3000-labelled": {
        source: "iana"
      },
      "application/vnd.wt.stf": {
        source: "iana",
        extensions: ["stf"]
      },
      "application/vnd.wv.csp+wbxml": {
        source: "iana"
      },
      "application/vnd.wv.csp+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.wv.ssp+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.xacml+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.xara": {
        source: "iana",
        extensions: ["xar"]
      },
      "application/vnd.xfdl": {
        source: "iana",
        extensions: ["xfdl"]
      },
      "application/vnd.xfdl.webform": {
        source: "iana"
      },
      "application/vnd.xmi+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.xmpie.cpkg": {
        source: "iana"
      },
      "application/vnd.xmpie.dpkg": {
        source: "iana"
      },
      "application/vnd.xmpie.plan": {
        source: "iana"
      },
      "application/vnd.xmpie.ppkg": {
        source: "iana"
      },
      "application/vnd.xmpie.xlim": {
        source: "iana"
      },
      "application/vnd.yamaha.hv-dic": {
        source: "iana",
        extensions: ["hvd"]
      },
      "application/vnd.yamaha.hv-script": {
        source: "iana",
        extensions: ["hvs"]
      },
      "application/vnd.yamaha.hv-voice": {
        source: "iana",
        extensions: ["hvp"]
      },
      "application/vnd.yamaha.openscoreformat": {
        source: "iana",
        extensions: ["osf"]
      },
      "application/vnd.yamaha.openscoreformat.osfpvg+xml": {
        source: "iana",
        compressible: true,
        extensions: ["osfpvg"]
      },
      "application/vnd.yamaha.remote-setup": {
        source: "iana"
      },
      "application/vnd.yamaha.smaf-audio": {
        source: "iana",
        extensions: ["saf"]
      },
      "application/vnd.yamaha.smaf-phrase": {
        source: "iana",
        extensions: ["spf"]
      },
      "application/vnd.yamaha.through-ngn": {
        source: "iana"
      },
      "application/vnd.yamaha.tunnel-udpencap": {
        source: "iana"
      },
      "application/vnd.yaoweme": {
        source: "iana"
      },
      "application/vnd.yellowriver-custom-menu": {
        source: "iana",
        extensions: ["cmp"]
      },
      "application/vnd.youtube.yt": {
        source: "iana"
      },
      "application/vnd.zul": {
        source: "iana",
        extensions: ["zir", "zirz"]
      },
      "application/vnd.zzazz.deck+xml": {
        source: "iana",
        compressible: true,
        extensions: ["zaz"]
      },
      "application/voicexml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["vxml"]
      },
      "application/voucher-cms+json": {
        source: "iana",
        compressible: true
      },
      "application/vq-rtcpxr": {
        source: "iana"
      },
      "application/wasm": {
        source: "iana",
        compressible: true,
        extensions: ["wasm"]
      },
      "application/watcherinfo+xml": {
        source: "iana",
        compressible: true,
        extensions: ["wif"]
      },
      "application/webpush-options+json": {
        source: "iana",
        compressible: true
      },
      "application/whoispp-query": {
        source: "iana"
      },
      "application/whoispp-response": {
        source: "iana"
      },
      "application/widget": {
        source: "iana",
        extensions: ["wgt"]
      },
      "application/winhlp": {
        source: "apache",
        extensions: ["hlp"]
      },
      "application/wita": {
        source: "iana"
      },
      "application/wordperfect5.1": {
        source: "iana"
      },
      "application/wsdl+xml": {
        source: "iana",
        compressible: true,
        extensions: ["wsdl"]
      },
      "application/wspolicy+xml": {
        source: "iana",
        compressible: true,
        extensions: ["wspolicy"]
      },
      "application/x-7z-compressed": {
        source: "apache",
        compressible: false,
        extensions: ["7z"]
      },
      "application/x-abiword": {
        source: "apache",
        extensions: ["abw"]
      },
      "application/x-ace-compressed": {
        source: "apache",
        extensions: ["ace"]
      },
      "application/x-amf": {
        source: "apache"
      },
      "application/x-apple-diskimage": {
        source: "apache",
        extensions: ["dmg"]
      },
      "application/x-arj": {
        compressible: false,
        extensions: ["arj"]
      },
      "application/x-authorware-bin": {
        source: "apache",
        extensions: ["aab", "x32", "u32", "vox"]
      },
      "application/x-authorware-map": {
        source: "apache",
        extensions: ["aam"]
      },
      "application/x-authorware-seg": {
        source: "apache",
        extensions: ["aas"]
      },
      "application/x-bcpio": {
        source: "apache",
        extensions: ["bcpio"]
      },
      "application/x-bdoc": {
        compressible: false,
        extensions: ["bdoc"]
      },
      "application/x-bittorrent": {
        source: "apache",
        extensions: ["torrent"]
      },
      "application/x-blorb": {
        source: "apache",
        extensions: ["blb", "blorb"]
      },
      "application/x-bzip": {
        source: "apache",
        compressible: false,
        extensions: ["bz"]
      },
      "application/x-bzip2": {
        source: "apache",
        compressible: false,
        extensions: ["bz2", "boz"]
      },
      "application/x-cbr": {
        source: "apache",
        extensions: ["cbr", "cba", "cbt", "cbz", "cb7"]
      },
      "application/x-cdlink": {
        source: "apache",
        extensions: ["vcd"]
      },
      "application/x-cfs-compressed": {
        source: "apache",
        extensions: ["cfs"]
      },
      "application/x-chat": {
        source: "apache",
        extensions: ["chat"]
      },
      "application/x-chess-pgn": {
        source: "apache",
        extensions: ["pgn"]
      },
      "application/x-chrome-extension": {
        extensions: ["crx"]
      },
      "application/x-cocoa": {
        source: "nginx",
        extensions: ["cco"]
      },
      "application/x-compress": {
        source: "apache"
      },
      "application/x-conference": {
        source: "apache",
        extensions: ["nsc"]
      },
      "application/x-cpio": {
        source: "apache",
        extensions: ["cpio"]
      },
      "application/x-csh": {
        source: "apache",
        extensions: ["csh"]
      },
      "application/x-deb": {
        compressible: false
      },
      "application/x-debian-package": {
        source: "apache",
        extensions: ["deb", "udeb"]
      },
      "application/x-dgc-compressed": {
        source: "apache",
        extensions: ["dgc"]
      },
      "application/x-director": {
        source: "apache",
        extensions: ["dir", "dcr", "dxr", "cst", "cct", "cxt", "w3d", "fgd", "swa"]
      },
      "application/x-doom": {
        source: "apache",
        extensions: ["wad"]
      },
      "application/x-dtbncx+xml": {
        source: "apache",
        compressible: true,
        extensions: ["ncx"]
      },
      "application/x-dtbook+xml": {
        source: "apache",
        compressible: true,
        extensions: ["dtb"]
      },
      "application/x-dtbresource+xml": {
        source: "apache",
        compressible: true,
        extensions: ["res"]
      },
      "application/x-dvi": {
        source: "apache",
        compressible: false,
        extensions: ["dvi"]
      },
      "application/x-envoy": {
        source: "apache",
        extensions: ["evy"]
      },
      "application/x-eva": {
        source: "apache",
        extensions: ["eva"]
      },
      "application/x-font-bdf": {
        source: "apache",
        extensions: ["bdf"]
      },
      "application/x-font-dos": {
        source: "apache"
      },
      "application/x-font-framemaker": {
        source: "apache"
      },
      "application/x-font-ghostscript": {
        source: "apache",
        extensions: ["gsf"]
      },
      "application/x-font-libgrx": {
        source: "apache"
      },
      "application/x-font-linux-psf": {
        source: "apache",
        extensions: ["psf"]
      },
      "application/x-font-pcf": {
        source: "apache",
        extensions: ["pcf"]
      },
      "application/x-font-snf": {
        source: "apache",
        extensions: ["snf"]
      },
      "application/x-font-speedo": {
        source: "apache"
      },
      "application/x-font-sunos-news": {
        source: "apache"
      },
      "application/x-font-type1": {
        source: "apache",
        extensions: ["pfa", "pfb", "pfm", "afm"]
      },
      "application/x-font-vfont": {
        source: "apache"
      },
      "application/x-freearc": {
        source: "apache",
        extensions: ["arc"]
      },
      "application/x-futuresplash": {
        source: "apache",
        extensions: ["spl"]
      },
      "application/x-gca-compressed": {
        source: "apache",
        extensions: ["gca"]
      },
      "application/x-glulx": {
        source: "apache",
        extensions: ["ulx"]
      },
      "application/x-gnumeric": {
        source: "apache",
        extensions: ["gnumeric"]
      },
      "application/x-gramps-xml": {
        source: "apache",
        extensions: ["gramps"]
      },
      "application/x-gtar": {
        source: "apache",
        extensions: ["gtar"]
      },
      "application/x-gzip": {
        source: "apache"
      },
      "application/x-hdf": {
        source: "apache",
        extensions: ["hdf"]
      },
      "application/x-httpd-php": {
        compressible: true,
        extensions: ["php"]
      },
      "application/x-install-instructions": {
        source: "apache",
        extensions: ["install"]
      },
      "application/x-iso9660-image": {
        source: "apache",
        extensions: ["iso"]
      },
      "application/x-iwork-keynote-sffkey": {
        extensions: ["key"]
      },
      "application/x-iwork-numbers-sffnumbers": {
        extensions: ["numbers"]
      },
      "application/x-iwork-pages-sffpages": {
        extensions: ["pages"]
      },
      "application/x-java-archive-diff": {
        source: "nginx",
        extensions: ["jardiff"]
      },
      "application/x-java-jnlp-file": {
        source: "apache",
        compressible: false,
        extensions: ["jnlp"]
      },
      "application/x-javascript": {
        compressible: true
      },
      "application/x-keepass2": {
        extensions: ["kdbx"]
      },
      "application/x-latex": {
        source: "apache",
        compressible: false,
        extensions: ["latex"]
      },
      "application/x-lua-bytecode": {
        extensions: ["luac"]
      },
      "application/x-lzh-compressed": {
        source: "apache",
        extensions: ["lzh", "lha"]
      },
      "application/x-makeself": {
        source: "nginx",
        extensions: ["run"]
      },
      "application/x-mie": {
        source: "apache",
        extensions: ["mie"]
      },
      "application/x-mobipocket-ebook": {
        source: "apache",
        extensions: ["prc", "mobi"]
      },
      "application/x-mpegurl": {
        compressible: false
      },
      "application/x-ms-application": {
        source: "apache",
        extensions: ["application"]
      },
      "application/x-ms-shortcut": {
        source: "apache",
        extensions: ["lnk"]
      },
      "application/x-ms-wmd": {
        source: "apache",
        extensions: ["wmd"]
      },
      "application/x-ms-wmz": {
        source: "apache",
        extensions: ["wmz"]
      },
      "application/x-ms-xbap": {
        source: "apache",
        extensions: ["xbap"]
      },
      "application/x-msaccess": {
        source: "apache",
        extensions: ["mdb"]
      },
      "application/x-msbinder": {
        source: "apache",
        extensions: ["obd"]
      },
      "application/x-mscardfile": {
        source: "apache",
        extensions: ["crd"]
      },
      "application/x-msclip": {
        source: "apache",
        extensions: ["clp"]
      },
      "application/x-msdos-program": {
        extensions: ["exe"]
      },
      "application/x-msdownload": {
        source: "apache",
        extensions: ["exe", "dll", "com", "bat", "msi"]
      },
      "application/x-msmediaview": {
        source: "apache",
        extensions: ["mvb", "m13", "m14"]
      },
      "application/x-msmetafile": {
        source: "apache",
        extensions: ["wmf", "wmz", "emf", "emz"]
      },
      "application/x-msmoney": {
        source: "apache",
        extensions: ["mny"]
      },
      "application/x-mspublisher": {
        source: "apache",
        extensions: ["pub"]
      },
      "application/x-msschedule": {
        source: "apache",
        extensions: ["scd"]
      },
      "application/x-msterminal": {
        source: "apache",
        extensions: ["trm"]
      },
      "application/x-mswrite": {
        source: "apache",
        extensions: ["wri"]
      },
      "application/x-netcdf": {
        source: "apache",
        extensions: ["nc", "cdf"]
      },
      "application/x-ns-proxy-autoconfig": {
        compressible: true,
        extensions: ["pac"]
      },
      "application/x-nzb": {
        source: "apache",
        extensions: ["nzb"]
      },
      "application/x-perl": {
        source: "nginx",
        extensions: ["pl", "pm"]
      },
      "application/x-pilot": {
        source: "nginx",
        extensions: ["prc", "pdb"]
      },
      "application/x-pkcs12": {
        source: "apache",
        compressible: false,
        extensions: ["p12", "pfx"]
      },
      "application/x-pkcs7-certificates": {
        source: "apache",
        extensions: ["p7b", "spc"]
      },
      "application/x-pkcs7-certreqresp": {
        source: "apache",
        extensions: ["p7r"]
      },
      "application/x-pki-message": {
        source: "iana"
      },
      "application/x-rar-compressed": {
        source: "apache",
        compressible: false,
        extensions: ["rar"]
      },
      "application/x-redhat-package-manager": {
        source: "nginx",
        extensions: ["rpm"]
      },
      "application/x-research-info-systems": {
        source: "apache",
        extensions: ["ris"]
      },
      "application/x-sea": {
        source: "nginx",
        extensions: ["sea"]
      },
      "application/x-sh": {
        source: "apache",
        compressible: true,
        extensions: ["sh"]
      },
      "application/x-shar": {
        source: "apache",
        extensions: ["shar"]
      },
      "application/x-shockwave-flash": {
        source: "apache",
        compressible: false,
        extensions: ["swf"]
      },
      "application/x-silverlight-app": {
        source: "apache",
        extensions: ["xap"]
      },
      "application/x-sql": {
        source: "apache",
        extensions: ["sql"]
      },
      "application/x-stuffit": {
        source: "apache",
        compressible: false,
        extensions: ["sit"]
      },
      "application/x-stuffitx": {
        source: "apache",
        extensions: ["sitx"]
      },
      "application/x-subrip": {
        source: "apache",
        extensions: ["srt"]
      },
      "application/x-sv4cpio": {
        source: "apache",
        extensions: ["sv4cpio"]
      },
      "application/x-sv4crc": {
        source: "apache",
        extensions: ["sv4crc"]
      },
      "application/x-t3vm-image": {
        source: "apache",
        extensions: ["t3"]
      },
      "application/x-tads": {
        source: "apache",
        extensions: ["gam"]
      },
      "application/x-tar": {
        source: "apache",
        compressible: true,
        extensions: ["tar"]
      },
      "application/x-tcl": {
        source: "apache",
        extensions: ["tcl", "tk"]
      },
      "application/x-tex": {
        source: "apache",
        extensions: ["tex"]
      },
      "application/x-tex-tfm": {
        source: "apache",
        extensions: ["tfm"]
      },
      "application/x-texinfo": {
        source: "apache",
        extensions: ["texinfo", "texi"]
      },
      "application/x-tgif": {
        source: "apache",
        extensions: ["obj"]
      },
      "application/x-ustar": {
        source: "apache",
        extensions: ["ustar"]
      },
      "application/x-virtualbox-hdd": {
        compressible: true,
        extensions: ["hdd"]
      },
      "application/x-virtualbox-ova": {
        compressible: true,
        extensions: ["ova"]
      },
      "application/x-virtualbox-ovf": {
        compressible: true,
        extensions: ["ovf"]
      },
      "application/x-virtualbox-vbox": {
        compressible: true,
        extensions: ["vbox"]
      },
      "application/x-virtualbox-vbox-extpack": {
        compressible: false,
        extensions: ["vbox-extpack"]
      },
      "application/x-virtualbox-vdi": {
        compressible: true,
        extensions: ["vdi"]
      },
      "application/x-virtualbox-vhd": {
        compressible: true,
        extensions: ["vhd"]
      },
      "application/x-virtualbox-vmdk": {
        compressible: true,
        extensions: ["vmdk"]
      },
      "application/x-wais-source": {
        source: "apache",
        extensions: ["src"]
      },
      "application/x-web-app-manifest+json": {
        compressible: true,
        extensions: ["webapp"]
      },
      "application/x-www-form-urlencoded": {
        source: "iana",
        compressible: true
      },
      "application/x-x509-ca-cert": {
        source: "iana",
        extensions: ["der", "crt", "pem"]
      },
      "application/x-x509-ca-ra-cert": {
        source: "iana"
      },
      "application/x-x509-next-ca-cert": {
        source: "iana"
      },
      "application/x-xfig": {
        source: "apache",
        extensions: ["fig"]
      },
      "application/x-xliff+xml": {
        source: "apache",
        compressible: true,
        extensions: ["xlf"]
      },
      "application/x-xpinstall": {
        source: "apache",
        compressible: false,
        extensions: ["xpi"]
      },
      "application/x-xz": {
        source: "apache",
        extensions: ["xz"]
      },
      "application/x-zmachine": {
        source: "apache",
        extensions: ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8"]
      },
      "application/x400-bp": {
        source: "iana"
      },
      "application/xacml+xml": {
        source: "iana",
        compressible: true
      },
      "application/xaml+xml": {
        source: "apache",
        compressible: true,
        extensions: ["xaml"]
      },
      "application/xcap-att+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xav"]
      },
      "application/xcap-caps+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xca"]
      },
      "application/xcap-diff+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xdf"]
      },
      "application/xcap-el+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xel"]
      },
      "application/xcap-error+xml": {
        source: "iana",
        compressible: true
      },
      "application/xcap-ns+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xns"]
      },
      "application/xcon-conference-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/xcon-conference-info-diff+xml": {
        source: "iana",
        compressible: true
      },
      "application/xenc+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xenc"]
      },
      "application/xhtml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xhtml", "xht"]
      },
      "application/xhtml-voice+xml": {
        source: "apache",
        compressible: true
      },
      "application/xliff+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xlf"]
      },
      "application/xml": {
        source: "iana",
        compressible: true,
        extensions: ["xml", "xsl", "xsd", "rng"]
      },
      "application/xml-dtd": {
        source: "iana",
        compressible: true,
        extensions: ["dtd"]
      },
      "application/xml-external-parsed-entity": {
        source: "iana"
      },
      "application/xml-patch+xml": {
        source: "iana",
        compressible: true
      },
      "application/xmpp+xml": {
        source: "iana",
        compressible: true
      },
      "application/xop+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xop"]
      },
      "application/xproc+xml": {
        source: "apache",
        compressible: true,
        extensions: ["xpl"]
      },
      "application/xslt+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xsl", "xslt"]
      },
      "application/xspf+xml": {
        source: "apache",
        compressible: true,
        extensions: ["xspf"]
      },
      "application/xv+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mxml", "xhvml", "xvml", "xvm"]
      },
      "application/yang": {
        source: "iana",
        extensions: ["yang"]
      },
      "application/yang-data+json": {
        source: "iana",
        compressible: true
      },
      "application/yang-data+xml": {
        source: "iana",
        compressible: true
      },
      "application/yang-patch+json": {
        source: "iana",
        compressible: true
      },
      "application/yang-patch+xml": {
        source: "iana",
        compressible: true
      },
      "application/yin+xml": {
        source: "iana",
        compressible: true,
        extensions: ["yin"]
      },
      "application/zip": {
        source: "iana",
        compressible: false,
        extensions: ["zip"]
      },
      "application/zlib": {
        source: "iana"
      },
      "application/zstd": {
        source: "iana"
      },
      "audio/1d-interleaved-parityfec": {
        source: "iana"
      },
      "audio/32kadpcm": {
        source: "iana"
      },
      "audio/3gpp": {
        source: "iana",
        compressible: false,
        extensions: ["3gpp"]
      },
      "audio/3gpp2": {
        source: "iana"
      },
      "audio/aac": {
        source: "iana"
      },
      "audio/ac3": {
        source: "iana"
      },
      "audio/adpcm": {
        source: "apache",
        extensions: ["adp"]
      },
      "audio/amr": {
        source: "iana",
        extensions: ["amr"]
      },
      "audio/amr-wb": {
        source: "iana"
      },
      "audio/amr-wb+": {
        source: "iana"
      },
      "audio/aptx": {
        source: "iana"
      },
      "audio/asc": {
        source: "iana"
      },
      "audio/atrac-advanced-lossless": {
        source: "iana"
      },
      "audio/atrac-x": {
        source: "iana"
      },
      "audio/atrac3": {
        source: "iana"
      },
      "audio/basic": {
        source: "iana",
        compressible: false,
        extensions: ["au", "snd"]
      },
      "audio/bv16": {
        source: "iana"
      },
      "audio/bv32": {
        source: "iana"
      },
      "audio/clearmode": {
        source: "iana"
      },
      "audio/cn": {
        source: "iana"
      },
      "audio/dat12": {
        source: "iana"
      },
      "audio/dls": {
        source: "iana"
      },
      "audio/dsr-es201108": {
        source: "iana"
      },
      "audio/dsr-es202050": {
        source: "iana"
      },
      "audio/dsr-es202211": {
        source: "iana"
      },
      "audio/dsr-es202212": {
        source: "iana"
      },
      "audio/dv": {
        source: "iana"
      },
      "audio/dvi4": {
        source: "iana"
      },
      "audio/eac3": {
        source: "iana"
      },
      "audio/encaprtp": {
        source: "iana"
      },
      "audio/evrc": {
        source: "iana"
      },
      "audio/evrc-qcp": {
        source: "iana"
      },
      "audio/evrc0": {
        source: "iana"
      },
      "audio/evrc1": {
        source: "iana"
      },
      "audio/evrcb": {
        source: "iana"
      },
      "audio/evrcb0": {
        source: "iana"
      },
      "audio/evrcb1": {
        source: "iana"
      },
      "audio/evrcnw": {
        source: "iana"
      },
      "audio/evrcnw0": {
        source: "iana"
      },
      "audio/evrcnw1": {
        source: "iana"
      },
      "audio/evrcwb": {
        source: "iana"
      },
      "audio/evrcwb0": {
        source: "iana"
      },
      "audio/evrcwb1": {
        source: "iana"
      },
      "audio/evs": {
        source: "iana"
      },
      "audio/flexfec": {
        source: "iana"
      },
      "audio/fwdred": {
        source: "iana"
      },
      "audio/g711-0": {
        source: "iana"
      },
      "audio/g719": {
        source: "iana"
      },
      "audio/g722": {
        source: "iana"
      },
      "audio/g7221": {
        source: "iana"
      },
      "audio/g723": {
        source: "iana"
      },
      "audio/g726-16": {
        source: "iana"
      },
      "audio/g726-24": {
        source: "iana"
      },
      "audio/g726-32": {
        source: "iana"
      },
      "audio/g726-40": {
        source: "iana"
      },
      "audio/g728": {
        source: "iana"
      },
      "audio/g729": {
        source: "iana"
      },
      "audio/g7291": {
        source: "iana"
      },
      "audio/g729d": {
        source: "iana"
      },
      "audio/g729e": {
        source: "iana"
      },
      "audio/gsm": {
        source: "iana"
      },
      "audio/gsm-efr": {
        source: "iana"
      },
      "audio/gsm-hr-08": {
        source: "iana"
      },
      "audio/ilbc": {
        source: "iana"
      },
      "audio/ip-mr_v2.5": {
        source: "iana"
      },
      "audio/isac": {
        source: "apache"
      },
      "audio/l16": {
        source: "iana"
      },
      "audio/l20": {
        source: "iana"
      },
      "audio/l24": {
        source: "iana",
        compressible: false
      },
      "audio/l8": {
        source: "iana"
      },
      "audio/lpc": {
        source: "iana"
      },
      "audio/melp": {
        source: "iana"
      },
      "audio/melp1200": {
        source: "iana"
      },
      "audio/melp2400": {
        source: "iana"
      },
      "audio/melp600": {
        source: "iana"
      },
      "audio/mhas": {
        source: "iana"
      },
      "audio/midi": {
        source: "apache",
        extensions: ["mid", "midi", "kar", "rmi"]
      },
      "audio/mobile-xmf": {
        source: "iana",
        extensions: ["mxmf"]
      },
      "audio/mp3": {
        compressible: false,
        extensions: ["mp3"]
      },
      "audio/mp4": {
        source: "iana",
        compressible: false,
        extensions: ["m4a", "mp4a"]
      },
      "audio/mp4a-latm": {
        source: "iana"
      },
      "audio/mpa": {
        source: "iana"
      },
      "audio/mpa-robust": {
        source: "iana"
      },
      "audio/mpeg": {
        source: "iana",
        compressible: false,
        extensions: ["mpga", "mp2", "mp2a", "mp3", "m2a", "m3a"]
      },
      "audio/mpeg4-generic": {
        source: "iana"
      },
      "audio/musepack": {
        source: "apache"
      },
      "audio/ogg": {
        source: "iana",
        compressible: false,
        extensions: ["oga", "ogg", "spx", "opus"]
      },
      "audio/opus": {
        source: "iana"
      },
      "audio/parityfec": {
        source: "iana"
      },
      "audio/pcma": {
        source: "iana"
      },
      "audio/pcma-wb": {
        source: "iana"
      },
      "audio/pcmu": {
        source: "iana"
      },
      "audio/pcmu-wb": {
        source: "iana"
      },
      "audio/prs.sid": {
        source: "iana"
      },
      "audio/qcelp": {
        source: "iana"
      },
      "audio/raptorfec": {
        source: "iana"
      },
      "audio/red": {
        source: "iana"
      },
      "audio/rtp-enc-aescm128": {
        source: "iana"
      },
      "audio/rtp-midi": {
        source: "iana"
      },
      "audio/rtploopback": {
        source: "iana"
      },
      "audio/rtx": {
        source: "iana"
      },
      "audio/s3m": {
        source: "apache",
        extensions: ["s3m"]
      },
      "audio/scip": {
        source: "iana"
      },
      "audio/silk": {
        source: "apache",
        extensions: ["sil"]
      },
      "audio/smv": {
        source: "iana"
      },
      "audio/smv-qcp": {
        source: "iana"
      },
      "audio/smv0": {
        source: "iana"
      },
      "audio/sofa": {
        source: "iana"
      },
      "audio/sp-midi": {
        source: "iana"
      },
      "audio/speex": {
        source: "iana"
      },
      "audio/t140c": {
        source: "iana"
      },
      "audio/t38": {
        source: "iana"
      },
      "audio/telephone-event": {
        source: "iana"
      },
      "audio/tetra_acelp": {
        source: "iana"
      },
      "audio/tetra_acelp_bb": {
        source: "iana"
      },
      "audio/tone": {
        source: "iana"
      },
      "audio/tsvcis": {
        source: "iana"
      },
      "audio/uemclip": {
        source: "iana"
      },
      "audio/ulpfec": {
        source: "iana"
      },
      "audio/usac": {
        source: "iana"
      },
      "audio/vdvi": {
        source: "iana"
      },
      "audio/vmr-wb": {
        source: "iana"
      },
      "audio/vnd.3gpp.iufp": {
        source: "iana"
      },
      "audio/vnd.4sb": {
        source: "iana"
      },
      "audio/vnd.audiokoz": {
        source: "iana"
      },
      "audio/vnd.celp": {
        source: "iana"
      },
      "audio/vnd.cisco.nse": {
        source: "iana"
      },
      "audio/vnd.cmles.radio-events": {
        source: "iana"
      },
      "audio/vnd.cns.anp1": {
        source: "iana"
      },
      "audio/vnd.cns.inf1": {
        source: "iana"
      },
      "audio/vnd.dece.audio": {
        source: "iana",
        extensions: ["uva", "uvva"]
      },
      "audio/vnd.digital-winds": {
        source: "iana",
        extensions: ["eol"]
      },
      "audio/vnd.dlna.adts": {
        source: "iana"
      },
      "audio/vnd.dolby.heaac.1": {
        source: "iana"
      },
      "audio/vnd.dolby.heaac.2": {
        source: "iana"
      },
      "audio/vnd.dolby.mlp": {
        source: "iana"
      },
      "audio/vnd.dolby.mps": {
        source: "iana"
      },
      "audio/vnd.dolby.pl2": {
        source: "iana"
      },
      "audio/vnd.dolby.pl2x": {
        source: "iana"
      },
      "audio/vnd.dolby.pl2z": {
        source: "iana"
      },
      "audio/vnd.dolby.pulse.1": {
        source: "iana"
      },
      "audio/vnd.dra": {
        source: "iana",
        extensions: ["dra"]
      },
      "audio/vnd.dts": {
        source: "iana",
        extensions: ["dts"]
      },
      "audio/vnd.dts.hd": {
        source: "iana",
        extensions: ["dtshd"]
      },
      "audio/vnd.dts.uhd": {
        source: "iana"
      },
      "audio/vnd.dvb.file": {
        source: "iana"
      },
      "audio/vnd.everad.plj": {
        source: "iana"
      },
      "audio/vnd.hns.audio": {
        source: "iana"
      },
      "audio/vnd.lucent.voice": {
        source: "iana",
        extensions: ["lvp"]
      },
      "audio/vnd.ms-playready.media.pya": {
        source: "iana",
        extensions: ["pya"]
      },
      "audio/vnd.nokia.mobile-xmf": {
        source: "iana"
      },
      "audio/vnd.nortel.vbk": {
        source: "iana"
      },
      "audio/vnd.nuera.ecelp4800": {
        source: "iana",
        extensions: ["ecelp4800"]
      },
      "audio/vnd.nuera.ecelp7470": {
        source: "iana",
        extensions: ["ecelp7470"]
      },
      "audio/vnd.nuera.ecelp9600": {
        source: "iana",
        extensions: ["ecelp9600"]
      },
      "audio/vnd.octel.sbc": {
        source: "iana"
      },
      "audio/vnd.presonus.multitrack": {
        source: "iana"
      },
      "audio/vnd.qcelp": {
        source: "iana"
      },
      "audio/vnd.rhetorex.32kadpcm": {
        source: "iana"
      },
      "audio/vnd.rip": {
        source: "iana",
        extensions: ["rip"]
      },
      "audio/vnd.rn-realaudio": {
        compressible: false
      },
      "audio/vnd.sealedmedia.softseal.mpeg": {
        source: "iana"
      },
      "audio/vnd.vmx.cvsd": {
        source: "iana"
      },
      "audio/vnd.wave": {
        compressible: false
      },
      "audio/vorbis": {
        source: "iana",
        compressible: false
      },
      "audio/vorbis-config": {
        source: "iana"
      },
      "audio/wav": {
        compressible: false,
        extensions: ["wav"]
      },
      "audio/wave": {
        compressible: false,
        extensions: ["wav"]
      },
      "audio/webm": {
        source: "apache",
        compressible: false,
        extensions: ["weba"]
      },
      "audio/x-aac": {
        source: "apache",
        compressible: false,
        extensions: ["aac"]
      },
      "audio/x-aiff": {
        source: "apache",
        extensions: ["aif", "aiff", "aifc"]
      },
      "audio/x-caf": {
        source: "apache",
        compressible: false,
        extensions: ["caf"]
      },
      "audio/x-flac": {
        source: "apache",
        extensions: ["flac"]
      },
      "audio/x-m4a": {
        source: "nginx",
        extensions: ["m4a"]
      },
      "audio/x-matroska": {
        source: "apache",
        extensions: ["mka"]
      },
      "audio/x-mpegurl": {
        source: "apache",
        extensions: ["m3u"]
      },
      "audio/x-ms-wax": {
        source: "apache",
        extensions: ["wax"]
      },
      "audio/x-ms-wma": {
        source: "apache",
        extensions: ["wma"]
      },
      "audio/x-pn-realaudio": {
        source: "apache",
        extensions: ["ram", "ra"]
      },
      "audio/x-pn-realaudio-plugin": {
        source: "apache",
        extensions: ["rmp"]
      },
      "audio/x-realaudio": {
        source: "nginx",
        extensions: ["ra"]
      },
      "audio/x-tta": {
        source: "apache"
      },
      "audio/x-wav": {
        source: "apache",
        extensions: ["wav"]
      },
      "audio/xm": {
        source: "apache",
        extensions: ["xm"]
      },
      "chemical/x-cdx": {
        source: "apache",
        extensions: ["cdx"]
      },
      "chemical/x-cif": {
        source: "apache",
        extensions: ["cif"]
      },
      "chemical/x-cmdf": {
        source: "apache",
        extensions: ["cmdf"]
      },
      "chemical/x-cml": {
        source: "apache",
        extensions: ["cml"]
      },
      "chemical/x-csml": {
        source: "apache",
        extensions: ["csml"]
      },
      "chemical/x-pdb": {
        source: "apache"
      },
      "chemical/x-xyz": {
        source: "apache",
        extensions: ["xyz"]
      },
      "font/collection": {
        source: "iana",
        extensions: ["ttc"]
      },
      "font/otf": {
        source: "iana",
        compressible: true,
        extensions: ["otf"]
      },
      "font/sfnt": {
        source: "iana"
      },
      "font/ttf": {
        source: "iana",
        compressible: true,
        extensions: ["ttf"]
      },
      "font/woff": {
        source: "iana",
        extensions: ["woff"]
      },
      "font/woff2": {
        source: "iana",
        extensions: ["woff2"]
      },
      "image/aces": {
        source: "iana",
        extensions: ["exr"]
      },
      "image/apng": {
        compressible: false,
        extensions: ["apng"]
      },
      "image/avci": {
        source: "iana",
        extensions: ["avci"]
      },
      "image/avcs": {
        source: "iana",
        extensions: ["avcs"]
      },
      "image/avif": {
        source: "iana",
        compressible: false,
        extensions: ["avif"]
      },
      "image/bmp": {
        source: "iana",
        compressible: true,
        extensions: ["bmp"]
      },
      "image/cgm": {
        source: "iana",
        extensions: ["cgm"]
      },
      "image/dicom-rle": {
        source: "iana",
        extensions: ["drle"]
      },
      "image/emf": {
        source: "iana",
        extensions: ["emf"]
      },
      "image/fits": {
        source: "iana",
        extensions: ["fits"]
      },
      "image/g3fax": {
        source: "iana",
        extensions: ["g3"]
      },
      "image/gif": {
        source: "iana",
        compressible: false,
        extensions: ["gif"]
      },
      "image/heic": {
        source: "iana",
        extensions: ["heic"]
      },
      "image/heic-sequence": {
        source: "iana",
        extensions: ["heics"]
      },
      "image/heif": {
        source: "iana",
        extensions: ["heif"]
      },
      "image/heif-sequence": {
        source: "iana",
        extensions: ["heifs"]
      },
      "image/hej2k": {
        source: "iana",
        extensions: ["hej2"]
      },
      "image/hsj2": {
        source: "iana",
        extensions: ["hsj2"]
      },
      "image/ief": {
        source: "iana",
        extensions: ["ief"]
      },
      "image/jls": {
        source: "iana",
        extensions: ["jls"]
      },
      "image/jp2": {
        source: "iana",
        compressible: false,
        extensions: ["jp2", "jpg2"]
      },
      "image/jpeg": {
        source: "iana",
        compressible: false,
        extensions: ["jpeg", "jpg", "jpe"]
      },
      "image/jph": {
        source: "iana",
        extensions: ["jph"]
      },
      "image/jphc": {
        source: "iana",
        extensions: ["jhc"]
      },
      "image/jpm": {
        source: "iana",
        compressible: false,
        extensions: ["jpm"]
      },
      "image/jpx": {
        source: "iana",
        compressible: false,
        extensions: ["jpx", "jpf"]
      },
      "image/jxr": {
        source: "iana",
        extensions: ["jxr"]
      },
      "image/jxra": {
        source: "iana",
        extensions: ["jxra"]
      },
      "image/jxrs": {
        source: "iana",
        extensions: ["jxrs"]
      },
      "image/jxs": {
        source: "iana",
        extensions: ["jxs"]
      },
      "image/jxsc": {
        source: "iana",
        extensions: ["jxsc"]
      },
      "image/jxsi": {
        source: "iana",
        extensions: ["jxsi"]
      },
      "image/jxss": {
        source: "iana",
        extensions: ["jxss"]
      },
      "image/ktx": {
        source: "iana",
        extensions: ["ktx"]
      },
      "image/ktx2": {
        source: "iana",
        extensions: ["ktx2"]
      },
      "image/naplps": {
        source: "iana"
      },
      "image/pjpeg": {
        compressible: false
      },
      "image/png": {
        source: "iana",
        compressible: false,
        extensions: ["png"]
      },
      "image/prs.btif": {
        source: "iana",
        extensions: ["btif"]
      },
      "image/prs.pti": {
        source: "iana",
        extensions: ["pti"]
      },
      "image/pwg-raster": {
        source: "iana"
      },
      "image/sgi": {
        source: "apache",
        extensions: ["sgi"]
      },
      "image/svg+xml": {
        source: "iana",
        compressible: true,
        extensions: ["svg", "svgz"]
      },
      "image/t38": {
        source: "iana",
        extensions: ["t38"]
      },
      "image/tiff": {
        source: "iana",
        compressible: false,
        extensions: ["tif", "tiff"]
      },
      "image/tiff-fx": {
        source: "iana",
        extensions: ["tfx"]
      },
      "image/vnd.adobe.photoshop": {
        source: "iana",
        compressible: true,
        extensions: ["psd"]
      },
      "image/vnd.airzip.accelerator.azv": {
        source: "iana",
        extensions: ["azv"]
      },
      "image/vnd.cns.inf2": {
        source: "iana"
      },
      "image/vnd.dece.graphic": {
        source: "iana",
        extensions: ["uvi", "uvvi", "uvg", "uvvg"]
      },
      "image/vnd.djvu": {
        source: "iana",
        extensions: ["djvu", "djv"]
      },
      "image/vnd.dvb.subtitle": {
        source: "iana",
        extensions: ["sub"]
      },
      "image/vnd.dwg": {
        source: "iana",
        extensions: ["dwg"]
      },
      "image/vnd.dxf": {
        source: "iana",
        extensions: ["dxf"]
      },
      "image/vnd.fastbidsheet": {
        source: "iana",
        extensions: ["fbs"]
      },
      "image/vnd.fpx": {
        source: "iana",
        extensions: ["fpx"]
      },
      "image/vnd.fst": {
        source: "iana",
        extensions: ["fst"]
      },
      "image/vnd.fujixerox.edmics-mmr": {
        source: "iana",
        extensions: ["mmr"]
      },
      "image/vnd.fujixerox.edmics-rlc": {
        source: "iana",
        extensions: ["rlc"]
      },
      "image/vnd.globalgraphics.pgb": {
        source: "iana"
      },
      "image/vnd.microsoft.icon": {
        source: "iana",
        compressible: true,
        extensions: ["ico"]
      },
      "image/vnd.mix": {
        source: "iana"
      },
      "image/vnd.mozilla.apng": {
        source: "iana"
      },
      "image/vnd.ms-dds": {
        compressible: true,
        extensions: ["dds"]
      },
      "image/vnd.ms-modi": {
        source: "iana",
        extensions: ["mdi"]
      },
      "image/vnd.ms-photo": {
        source: "apache",
        extensions: ["wdp"]
      },
      "image/vnd.net-fpx": {
        source: "iana",
        extensions: ["npx"]
      },
      "image/vnd.pco.b16": {
        source: "iana",
        extensions: ["b16"]
      },
      "image/vnd.radiance": {
        source: "iana"
      },
      "image/vnd.sealed.png": {
        source: "iana"
      },
      "image/vnd.sealedmedia.softseal.gif": {
        source: "iana"
      },
      "image/vnd.sealedmedia.softseal.jpg": {
        source: "iana"
      },
      "image/vnd.svf": {
        source: "iana"
      },
      "image/vnd.tencent.tap": {
        source: "iana",
        extensions: ["tap"]
      },
      "image/vnd.valve.source.texture": {
        source: "iana",
        extensions: ["vtf"]
      },
      "image/vnd.wap.wbmp": {
        source: "iana",
        extensions: ["wbmp"]
      },
      "image/vnd.xiff": {
        source: "iana",
        extensions: ["xif"]
      },
      "image/vnd.zbrush.pcx": {
        source: "iana",
        extensions: ["pcx"]
      },
      "image/webp": {
        source: "apache",
        extensions: ["webp"]
      },
      "image/wmf": {
        source: "iana",
        extensions: ["wmf"]
      },
      "image/x-3ds": {
        source: "apache",
        extensions: ["3ds"]
      },
      "image/x-cmu-raster": {
        source: "apache",
        extensions: ["ras"]
      },
      "image/x-cmx": {
        source: "apache",
        extensions: ["cmx"]
      },
      "image/x-freehand": {
        source: "apache",
        extensions: ["fh", "fhc", "fh4", "fh5", "fh7"]
      },
      "image/x-icon": {
        source: "apache",
        compressible: true,
        extensions: ["ico"]
      },
      "image/x-jng": {
        source: "nginx",
        extensions: ["jng"]
      },
      "image/x-mrsid-image": {
        source: "apache",
        extensions: ["sid"]
      },
      "image/x-ms-bmp": {
        source: "nginx",
        compressible: true,
        extensions: ["bmp"]
      },
      "image/x-pcx": {
        source: "apache",
        extensions: ["pcx"]
      },
      "image/x-pict": {
        source: "apache",
        extensions: ["pic", "pct"]
      },
      "image/x-portable-anymap": {
        source: "apache",
        extensions: ["pnm"]
      },
      "image/x-portable-bitmap": {
        source: "apache",
        extensions: ["pbm"]
      },
      "image/x-portable-graymap": {
        source: "apache",
        extensions: ["pgm"]
      },
      "image/x-portable-pixmap": {
        source: "apache",
        extensions: ["ppm"]
      },
      "image/x-rgb": {
        source: "apache",
        extensions: ["rgb"]
      },
      "image/x-tga": {
        source: "apache",
        extensions: ["tga"]
      },
      "image/x-xbitmap": {
        source: "apache",
        extensions: ["xbm"]
      },
      "image/x-xcf": {
        compressible: false
      },
      "image/x-xpixmap": {
        source: "apache",
        extensions: ["xpm"]
      },
      "image/x-xwindowdump": {
        source: "apache",
        extensions: ["xwd"]
      },
      "message/cpim": {
        source: "iana"
      },
      "message/delivery-status": {
        source: "iana"
      },
      "message/disposition-notification": {
        source: "iana",
        extensions: [
          "disposition-notification"
        ]
      },
      "message/external-body": {
        source: "iana"
      },
      "message/feedback-report": {
        source: "iana"
      },
      "message/global": {
        source: "iana",
        extensions: ["u8msg"]
      },
      "message/global-delivery-status": {
        source: "iana",
        extensions: ["u8dsn"]
      },
      "message/global-disposition-notification": {
        source: "iana",
        extensions: ["u8mdn"]
      },
      "message/global-headers": {
        source: "iana",
        extensions: ["u8hdr"]
      },
      "message/http": {
        source: "iana",
        compressible: false
      },
      "message/imdn+xml": {
        source: "iana",
        compressible: true
      },
      "message/news": {
        source: "iana"
      },
      "message/partial": {
        source: "iana",
        compressible: false
      },
      "message/rfc822": {
        source: "iana",
        compressible: true,
        extensions: ["eml", "mime"]
      },
      "message/s-http": {
        source: "iana"
      },
      "message/sip": {
        source: "iana"
      },
      "message/sipfrag": {
        source: "iana"
      },
      "message/tracking-status": {
        source: "iana"
      },
      "message/vnd.si.simp": {
        source: "iana"
      },
      "message/vnd.wfa.wsc": {
        source: "iana",
        extensions: ["wsc"]
      },
      "model/3mf": {
        source: "iana",
        extensions: ["3mf"]
      },
      "model/e57": {
        source: "iana"
      },
      "model/gltf+json": {
        source: "iana",
        compressible: true,
        extensions: ["gltf"]
      },
      "model/gltf-binary": {
        source: "iana",
        compressible: true,
        extensions: ["glb"]
      },
      "model/iges": {
        source: "iana",
        compressible: false,
        extensions: ["igs", "iges"]
      },
      "model/mesh": {
        source: "iana",
        compressible: false,
        extensions: ["msh", "mesh", "silo"]
      },
      "model/mtl": {
        source: "iana",
        extensions: ["mtl"]
      },
      "model/obj": {
        source: "iana",
        extensions: ["obj"]
      },
      "model/step": {
        source: "iana"
      },
      "model/step+xml": {
        source: "iana",
        compressible: true,
        extensions: ["stpx"]
      },
      "model/step+zip": {
        source: "iana",
        compressible: false,
        extensions: ["stpz"]
      },
      "model/step-xml+zip": {
        source: "iana",
        compressible: false,
        extensions: ["stpxz"]
      },
      "model/stl": {
        source: "iana",
        extensions: ["stl"]
      },
      "model/vnd.collada+xml": {
        source: "iana",
        compressible: true,
        extensions: ["dae"]
      },
      "model/vnd.dwf": {
        source: "iana",
        extensions: ["dwf"]
      },
      "model/vnd.flatland.3dml": {
        source: "iana"
      },
      "model/vnd.gdl": {
        source: "iana",
        extensions: ["gdl"]
      },
      "model/vnd.gs-gdl": {
        source: "apache"
      },
      "model/vnd.gs.gdl": {
        source: "iana"
      },
      "model/vnd.gtw": {
        source: "iana",
        extensions: ["gtw"]
      },
      "model/vnd.moml+xml": {
        source: "iana",
        compressible: true
      },
      "model/vnd.mts": {
        source: "iana",
        extensions: ["mts"]
      },
      "model/vnd.opengex": {
        source: "iana",
        extensions: ["ogex"]
      },
      "model/vnd.parasolid.transmit.binary": {
        source: "iana",
        extensions: ["x_b"]
      },
      "model/vnd.parasolid.transmit.text": {
        source: "iana",
        extensions: ["x_t"]
      },
      "model/vnd.pytha.pyox": {
        source: "iana"
      },
      "model/vnd.rosette.annotated-data-model": {
        source: "iana"
      },
      "model/vnd.sap.vds": {
        source: "iana",
        extensions: ["vds"]
      },
      "model/vnd.usdz+zip": {
        source: "iana",
        compressible: false,
        extensions: ["usdz"]
      },
      "model/vnd.valve.source.compiled-map": {
        source: "iana",
        extensions: ["bsp"]
      },
      "model/vnd.vtu": {
        source: "iana",
        extensions: ["vtu"]
      },
      "model/vrml": {
        source: "iana",
        compressible: false,
        extensions: ["wrl", "vrml"]
      },
      "model/x3d+binary": {
        source: "apache",
        compressible: false,
        extensions: ["x3db", "x3dbz"]
      },
      "model/x3d+fastinfoset": {
        source: "iana",
        extensions: ["x3db"]
      },
      "model/x3d+vrml": {
        source: "apache",
        compressible: false,
        extensions: ["x3dv", "x3dvz"]
      },
      "model/x3d+xml": {
        source: "iana",
        compressible: true,
        extensions: ["x3d", "x3dz"]
      },
      "model/x3d-vrml": {
        source: "iana",
        extensions: ["x3dv"]
      },
      "multipart/alternative": {
        source: "iana",
        compressible: false
      },
      "multipart/appledouble": {
        source: "iana"
      },
      "multipart/byteranges": {
        source: "iana"
      },
      "multipart/digest": {
        source: "iana"
      },
      "multipart/encrypted": {
        source: "iana",
        compressible: false
      },
      "multipart/form-data": {
        source: "iana",
        compressible: false
      },
      "multipart/header-set": {
        source: "iana"
      },
      "multipart/mixed": {
        source: "iana"
      },
      "multipart/multilingual": {
        source: "iana"
      },
      "multipart/parallel": {
        source: "iana"
      },
      "multipart/related": {
        source: "iana",
        compressible: false
      },
      "multipart/report": {
        source: "iana"
      },
      "multipart/signed": {
        source: "iana",
        compressible: false
      },
      "multipart/vnd.bint.med-plus": {
        source: "iana"
      },
      "multipart/voice-message": {
        source: "iana"
      },
      "multipart/x-mixed-replace": {
        source: "iana"
      },
      "text/1d-interleaved-parityfec": {
        source: "iana"
      },
      "text/cache-manifest": {
        source: "iana",
        compressible: true,
        extensions: ["appcache", "manifest"]
      },
      "text/calendar": {
        source: "iana",
        extensions: ["ics", "ifb"]
      },
      "text/calender": {
        compressible: true
      },
      "text/cmd": {
        compressible: true
      },
      "text/coffeescript": {
        extensions: ["coffee", "litcoffee"]
      },
      "text/cql": {
        source: "iana"
      },
      "text/cql-expression": {
        source: "iana"
      },
      "text/cql-identifier": {
        source: "iana"
      },
      "text/css": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["css"]
      },
      "text/csv": {
        source: "iana",
        compressible: true,
        extensions: ["csv"]
      },
      "text/csv-schema": {
        source: "iana"
      },
      "text/directory": {
        source: "iana"
      },
      "text/dns": {
        source: "iana"
      },
      "text/ecmascript": {
        source: "iana"
      },
      "text/encaprtp": {
        source: "iana"
      },
      "text/enriched": {
        source: "iana"
      },
      "text/fhirpath": {
        source: "iana"
      },
      "text/flexfec": {
        source: "iana"
      },
      "text/fwdred": {
        source: "iana"
      },
      "text/gff3": {
        source: "iana"
      },
      "text/grammar-ref-list": {
        source: "iana"
      },
      "text/html": {
        source: "iana",
        compressible: true,
        extensions: ["html", "htm", "shtml"]
      },
      "text/jade": {
        extensions: ["jade"]
      },
      "text/javascript": {
        source: "iana",
        compressible: true
      },
      "text/jcr-cnd": {
        source: "iana"
      },
      "text/jsx": {
        compressible: true,
        extensions: ["jsx"]
      },
      "text/less": {
        compressible: true,
        extensions: ["less"]
      },
      "text/markdown": {
        source: "iana",
        compressible: true,
        extensions: ["markdown", "md"]
      },
      "text/mathml": {
        source: "nginx",
        extensions: ["mml"]
      },
      "text/mdx": {
        compressible: true,
        extensions: ["mdx"]
      },
      "text/mizar": {
        source: "iana"
      },
      "text/n3": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["n3"]
      },
      "text/parameters": {
        source: "iana",
        charset: "UTF-8"
      },
      "text/parityfec": {
        source: "iana"
      },
      "text/plain": {
        source: "iana",
        compressible: true,
        extensions: ["txt", "text", "conf", "def", "list", "log", "in", "ini"]
      },
      "text/provenance-notation": {
        source: "iana",
        charset: "UTF-8"
      },
      "text/prs.fallenstein.rst": {
        source: "iana"
      },
      "text/prs.lines.tag": {
        source: "iana",
        extensions: ["dsc"]
      },
      "text/prs.prop.logic": {
        source: "iana"
      },
      "text/raptorfec": {
        source: "iana"
      },
      "text/red": {
        source: "iana"
      },
      "text/rfc822-headers": {
        source: "iana"
      },
      "text/richtext": {
        source: "iana",
        compressible: true,
        extensions: ["rtx"]
      },
      "text/rtf": {
        source: "iana",
        compressible: true,
        extensions: ["rtf"]
      },
      "text/rtp-enc-aescm128": {
        source: "iana"
      },
      "text/rtploopback": {
        source: "iana"
      },
      "text/rtx": {
        source: "iana"
      },
      "text/sgml": {
        source: "iana",
        extensions: ["sgml", "sgm"]
      },
      "text/shaclc": {
        source: "iana"
      },
      "text/shex": {
        source: "iana",
        extensions: ["shex"]
      },
      "text/slim": {
        extensions: ["slim", "slm"]
      },
      "text/spdx": {
        source: "iana",
        extensions: ["spdx"]
      },
      "text/strings": {
        source: "iana"
      },
      "text/stylus": {
        extensions: ["stylus", "styl"]
      },
      "text/t140": {
        source: "iana"
      },
      "text/tab-separated-values": {
        source: "iana",
        compressible: true,
        extensions: ["tsv"]
      },
      "text/troff": {
        source: "iana",
        extensions: ["t", "tr", "roff", "man", "me", "ms"]
      },
      "text/turtle": {
        source: "iana",
        charset: "UTF-8",
        extensions: ["ttl"]
      },
      "text/ulpfec": {
        source: "iana"
      },
      "text/uri-list": {
        source: "iana",
        compressible: true,
        extensions: ["uri", "uris", "urls"]
      },
      "text/vcard": {
        source: "iana",
        compressible: true,
        extensions: ["vcard"]
      },
      "text/vnd.a": {
        source: "iana"
      },
      "text/vnd.abc": {
        source: "iana"
      },
      "text/vnd.ascii-art": {
        source: "iana"
      },
      "text/vnd.curl": {
        source: "iana",
        extensions: ["curl"]
      },
      "text/vnd.curl.dcurl": {
        source: "apache",
        extensions: ["dcurl"]
      },
      "text/vnd.curl.mcurl": {
        source: "apache",
        extensions: ["mcurl"]
      },
      "text/vnd.curl.scurl": {
        source: "apache",
        extensions: ["scurl"]
      },
      "text/vnd.debian.copyright": {
        source: "iana",
        charset: "UTF-8"
      },
      "text/vnd.dmclientscript": {
        source: "iana"
      },
      "text/vnd.dvb.subtitle": {
        source: "iana",
        extensions: ["sub"]
      },
      "text/vnd.esmertec.theme-descriptor": {
        source: "iana",
        charset: "UTF-8"
      },
      "text/vnd.familysearch.gedcom": {
        source: "iana",
        extensions: ["ged"]
      },
      "text/vnd.ficlab.flt": {
        source: "iana"
      },
      "text/vnd.fly": {
        source: "iana",
        extensions: ["fly"]
      },
      "text/vnd.fmi.flexstor": {
        source: "iana",
        extensions: ["flx"]
      },
      "text/vnd.gml": {
        source: "iana"
      },
      "text/vnd.graphviz": {
        source: "iana",
        extensions: ["gv"]
      },
      "text/vnd.hans": {
        source: "iana"
      },
      "text/vnd.hgl": {
        source: "iana"
      },
      "text/vnd.in3d.3dml": {
        source: "iana",
        extensions: ["3dml"]
      },
      "text/vnd.in3d.spot": {
        source: "iana",
        extensions: ["spot"]
      },
      "text/vnd.iptc.newsml": {
        source: "iana"
      },
      "text/vnd.iptc.nitf": {
        source: "iana"
      },
      "text/vnd.latex-z": {
        source: "iana"
      },
      "text/vnd.motorola.reflex": {
        source: "iana"
      },
      "text/vnd.ms-mediapackage": {
        source: "iana"
      },
      "text/vnd.net2phone.commcenter.command": {
        source: "iana"
      },
      "text/vnd.radisys.msml-basic-layout": {
        source: "iana"
      },
      "text/vnd.senx.warpscript": {
        source: "iana"
      },
      "text/vnd.si.uricatalogue": {
        source: "iana"
      },
      "text/vnd.sosi": {
        source: "iana"
      },
      "text/vnd.sun.j2me.app-descriptor": {
        source: "iana",
        charset: "UTF-8",
        extensions: ["jad"]
      },
      "text/vnd.trolltech.linguist": {
        source: "iana",
        charset: "UTF-8"
      },
      "text/vnd.wap.si": {
        source: "iana"
      },
      "text/vnd.wap.sl": {
        source: "iana"
      },
      "text/vnd.wap.wml": {
        source: "iana",
        extensions: ["wml"]
      },
      "text/vnd.wap.wmlscript": {
        source: "iana",
        extensions: ["wmls"]
      },
      "text/vtt": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["vtt"]
      },
      "text/x-asm": {
        source: "apache",
        extensions: ["s", "asm"]
      },
      "text/x-c": {
        source: "apache",
        extensions: ["c", "cc", "cxx", "cpp", "h", "hh", "dic"]
      },
      "text/x-component": {
        source: "nginx",
        extensions: ["htc"]
      },
      "text/x-fortran": {
        source: "apache",
        extensions: ["f", "for", "f77", "f90"]
      },
      "text/x-gwt-rpc": {
        compressible: true
      },
      "text/x-handlebars-template": {
        extensions: ["hbs"]
      },
      "text/x-java-source": {
        source: "apache",
        extensions: ["java"]
      },
      "text/x-jquery-tmpl": {
        compressible: true
      },
      "text/x-lua": {
        extensions: ["lua"]
      },
      "text/x-markdown": {
        compressible: true,
        extensions: ["mkd"]
      },
      "text/x-nfo": {
        source: "apache",
        extensions: ["nfo"]
      },
      "text/x-opml": {
        source: "apache",
        extensions: ["opml"]
      },
      "text/x-org": {
        compressible: true,
        extensions: ["org"]
      },
      "text/x-pascal": {
        source: "apache",
        extensions: ["p", "pas"]
      },
      "text/x-processing": {
        compressible: true,
        extensions: ["pde"]
      },
      "text/x-sass": {
        extensions: ["sass"]
      },
      "text/x-scss": {
        extensions: ["scss"]
      },
      "text/x-setext": {
        source: "apache",
        extensions: ["etx"]
      },
      "text/x-sfv": {
        source: "apache",
        extensions: ["sfv"]
      },
      "text/x-suse-ymp": {
        compressible: true,
        extensions: ["ymp"]
      },
      "text/x-uuencode": {
        source: "apache",
        extensions: ["uu"]
      },
      "text/x-vcalendar": {
        source: "apache",
        extensions: ["vcs"]
      },
      "text/x-vcard": {
        source: "apache",
        extensions: ["vcf"]
      },
      "text/xml": {
        source: "iana",
        compressible: true,
        extensions: ["xml"]
      },
      "text/xml-external-parsed-entity": {
        source: "iana"
      },
      "text/yaml": {
        compressible: true,
        extensions: ["yaml", "yml"]
      },
      "video/1d-interleaved-parityfec": {
        source: "iana"
      },
      "video/3gpp": {
        source: "iana",
        extensions: ["3gp", "3gpp"]
      },
      "video/3gpp-tt": {
        source: "iana"
      },
      "video/3gpp2": {
        source: "iana",
        extensions: ["3g2"]
      },
      "video/av1": {
        source: "iana"
      },
      "video/bmpeg": {
        source: "iana"
      },
      "video/bt656": {
        source: "iana"
      },
      "video/celb": {
        source: "iana"
      },
      "video/dv": {
        source: "iana"
      },
      "video/encaprtp": {
        source: "iana"
      },
      "video/ffv1": {
        source: "iana"
      },
      "video/flexfec": {
        source: "iana"
      },
      "video/h261": {
        source: "iana",
        extensions: ["h261"]
      },
      "video/h263": {
        source: "iana",
        extensions: ["h263"]
      },
      "video/h263-1998": {
        source: "iana"
      },
      "video/h263-2000": {
        source: "iana"
      },
      "video/h264": {
        source: "iana",
        extensions: ["h264"]
      },
      "video/h264-rcdo": {
        source: "iana"
      },
      "video/h264-svc": {
        source: "iana"
      },
      "video/h265": {
        source: "iana"
      },
      "video/iso.segment": {
        source: "iana",
        extensions: ["m4s"]
      },
      "video/jpeg": {
        source: "iana",
        extensions: ["jpgv"]
      },
      "video/jpeg2000": {
        source: "iana"
      },
      "video/jpm": {
        source: "apache",
        extensions: ["jpm", "jpgm"]
      },
      "video/jxsv": {
        source: "iana"
      },
      "video/mj2": {
        source: "iana",
        extensions: ["mj2", "mjp2"]
      },
      "video/mp1s": {
        source: "iana"
      },
      "video/mp2p": {
        source: "iana"
      },
      "video/mp2t": {
        source: "iana",
        extensions: ["ts"]
      },
      "video/mp4": {
        source: "iana",
        compressible: false,
        extensions: ["mp4", "mp4v", "mpg4"]
      },
      "video/mp4v-es": {
        source: "iana"
      },
      "video/mpeg": {
        source: "iana",
        compressible: false,
        extensions: ["mpeg", "mpg", "mpe", "m1v", "m2v"]
      },
      "video/mpeg4-generic": {
        source: "iana"
      },
      "video/mpv": {
        source: "iana"
      },
      "video/nv": {
        source: "iana"
      },
      "video/ogg": {
        source: "iana",
        compressible: false,
        extensions: ["ogv"]
      },
      "video/parityfec": {
        source: "iana"
      },
      "video/pointer": {
        source: "iana"
      },
      "video/quicktime": {
        source: "iana",
        compressible: false,
        extensions: ["qt", "mov"]
      },
      "video/raptorfec": {
        source: "iana"
      },
      "video/raw": {
        source: "iana"
      },
      "video/rtp-enc-aescm128": {
        source: "iana"
      },
      "video/rtploopback": {
        source: "iana"
      },
      "video/rtx": {
        source: "iana"
      },
      "video/scip": {
        source: "iana"
      },
      "video/smpte291": {
        source: "iana"
      },
      "video/smpte292m": {
        source: "iana"
      },
      "video/ulpfec": {
        source: "iana"
      },
      "video/vc1": {
        source: "iana"
      },
      "video/vc2": {
        source: "iana"
      },
      "video/vnd.cctv": {
        source: "iana"
      },
      "video/vnd.dece.hd": {
        source: "iana",
        extensions: ["uvh", "uvvh"]
      },
      "video/vnd.dece.mobile": {
        source: "iana",
        extensions: ["uvm", "uvvm"]
      },
      "video/vnd.dece.mp4": {
        source: "iana"
      },
      "video/vnd.dece.pd": {
        source: "iana",
        extensions: ["uvp", "uvvp"]
      },
      "video/vnd.dece.sd": {
        source: "iana",
        extensions: ["uvs", "uvvs"]
      },
      "video/vnd.dece.video": {
        source: "iana",
        extensions: ["uvv", "uvvv"]
      },
      "video/vnd.directv.mpeg": {
        source: "iana"
      },
      "video/vnd.directv.mpeg-tts": {
        source: "iana"
      },
      "video/vnd.dlna.mpeg-tts": {
        source: "iana"
      },
      "video/vnd.dvb.file": {
        source: "iana",
        extensions: ["dvb"]
      },
      "video/vnd.fvt": {
        source: "iana",
        extensions: ["fvt"]
      },
      "video/vnd.hns.video": {
        source: "iana"
      },
      "video/vnd.iptvforum.1dparityfec-1010": {
        source: "iana"
      },
      "video/vnd.iptvforum.1dparityfec-2005": {
        source: "iana"
      },
      "video/vnd.iptvforum.2dparityfec-1010": {
        source: "iana"
      },
      "video/vnd.iptvforum.2dparityfec-2005": {
        source: "iana"
      },
      "video/vnd.iptvforum.ttsavc": {
        source: "iana"
      },
      "video/vnd.iptvforum.ttsmpeg2": {
        source: "iana"
      },
      "video/vnd.motorola.video": {
        source: "iana"
      },
      "video/vnd.motorola.videop": {
        source: "iana"
      },
      "video/vnd.mpegurl": {
        source: "iana",
        extensions: ["mxu", "m4u"]
      },
      "video/vnd.ms-playready.media.pyv": {
        source: "iana",
        extensions: ["pyv"]
      },
      "video/vnd.nokia.interleaved-multimedia": {
        source: "iana"
      },
      "video/vnd.nokia.mp4vr": {
        source: "iana"
      },
      "video/vnd.nokia.videovoip": {
        source: "iana"
      },
      "video/vnd.objectvideo": {
        source: "iana"
      },
      "video/vnd.radgamettools.bink": {
        source: "iana"
      },
      "video/vnd.radgamettools.smacker": {
        source: "iana"
      },
      "video/vnd.sealed.mpeg1": {
        source: "iana"
      },
      "video/vnd.sealed.mpeg4": {
        source: "iana"
      },
      "video/vnd.sealed.swf": {
        source: "iana"
      },
      "video/vnd.sealedmedia.softseal.mov": {
        source: "iana"
      },
      "video/vnd.uvvu.mp4": {
        source: "iana",
        extensions: ["uvu", "uvvu"]
      },
      "video/vnd.vivo": {
        source: "iana",
        extensions: ["viv"]
      },
      "video/vnd.youtube.yt": {
        source: "iana"
      },
      "video/vp8": {
        source: "iana"
      },
      "video/vp9": {
        source: "iana"
      },
      "video/webm": {
        source: "apache",
        compressible: false,
        extensions: ["webm"]
      },
      "video/x-f4v": {
        source: "apache",
        extensions: ["f4v"]
      },
      "video/x-fli": {
        source: "apache",
        extensions: ["fli"]
      },
      "video/x-flv": {
        source: "apache",
        compressible: false,
        extensions: ["flv"]
      },
      "video/x-m4v": {
        source: "apache",
        extensions: ["m4v"]
      },
      "video/x-matroska": {
        source: "apache",
        compressible: false,
        extensions: ["mkv", "mk3d", "mks"]
      },
      "video/x-mng": {
        source: "apache",
        extensions: ["mng"]
      },
      "video/x-ms-asf": {
        source: "apache",
        extensions: ["asf", "asx"]
      },
      "video/x-ms-vob": {
        source: "apache",
        extensions: ["vob"]
      },
      "video/x-ms-wm": {
        source: "apache",
        extensions: ["wm"]
      },
      "video/x-ms-wmv": {
        source: "apache",
        compressible: false,
        extensions: ["wmv"]
      },
      "video/x-ms-wmx": {
        source: "apache",
        extensions: ["wmx"]
      },
      "video/x-ms-wvx": {
        source: "apache",
        extensions: ["wvx"]
      },
      "video/x-msvideo": {
        source: "apache",
        extensions: ["avi"]
      },
      "video/x-sgi-movie": {
        source: "apache",
        extensions: ["movie"]
      },
      "video/x-smv": {
        source: "apache",
        extensions: ["smv"]
      },
      "x-conference/x-cooltalk": {
        source: "apache",
        extensions: ["ice"]
      },
      "x-shader/x-fragment": {
        compressible: true
      },
      "x-shader/x-vertex": {
        compressible: true
      }
    };
  }
});

// node_modules/mime-db/index.js
var require_mime_db = __commonJS({
  "node_modules/mime-db/index.js"(exports2, module2) {
    module2.exports = require_db();
  }
});

// node_modules/mime-types/index.js
var require_mime_types = __commonJS({
  "node_modules/mime-types/index.js"(exports2) {
    "use strict";
    var db = require_mime_db();
    var extname = require("path").extname;
    var EXTRACT_TYPE_REGEXP = /^\s*([^;\s]*)(?:;|\s|$)/;
    var TEXT_TYPE_REGEXP = /^text\//i;
    exports2.charset = charset;
    exports2.charsets = { lookup: charset };
    exports2.contentType = contentType;
    exports2.extension = extension;
    exports2.extensions = /* @__PURE__ */ Object.create(null);
    exports2.lookup = lookup;
    exports2.types = /* @__PURE__ */ Object.create(null);
    populateMaps(exports2.extensions, exports2.types);
    function charset(type) {
      if (!type || typeof type !== "string") {
        return false;
      }
      var match = EXTRACT_TYPE_REGEXP.exec(type);
      var mime = match && db[match[1].toLowerCase()];
      if (mime && mime.charset) {
        return mime.charset;
      }
      if (match && TEXT_TYPE_REGEXP.test(match[1])) {
        return "UTF-8";
      }
      return false;
    }
    function contentType(str) {
      if (!str || typeof str !== "string") {
        return false;
      }
      var mime = str.indexOf("/") === -1 ? exports2.lookup(str) : str;
      if (!mime) {
        return false;
      }
      if (mime.indexOf("charset") === -1) {
        var charset2 = exports2.charset(mime);
        if (charset2) mime += "; charset=" + charset2.toLowerCase();
      }
      return mime;
    }
    function extension(type) {
      if (!type || typeof type !== "string") {
        return false;
      }
      var match = EXTRACT_TYPE_REGEXP.exec(type);
      var exts = match && exports2.extensions[match[1].toLowerCase()];
      if (!exts || !exts.length) {
        return false;
      }
      return exts[0];
    }
    function lookup(path2) {
      if (!path2 || typeof path2 !== "string") {
        return false;
      }
      var extension2 = extname("x." + path2).toLowerCase().substr(1);
      if (!extension2) {
        return false;
      }
      return exports2.types[extension2] || false;
    }
    function populateMaps(extensions, types) {
      var preference = ["nginx", "apache", void 0, "iana"];
      Object.keys(db).forEach(function forEachMimeType(type) {
        var mime = db[type];
        var exts = mime.extensions;
        if (!exts || !exts.length) {
          return;
        }
        extensions[type] = exts;
        for (var i = 0; i < exts.length; i++) {
          var extension2 = exts[i];
          if (types[extension2]) {
            var from = preference.indexOf(db[types[extension2]].source);
            var to = preference.indexOf(mime.source);
            if (types[extension2] !== "application/octet-stream" && (from > to || from === to && types[extension2].substr(0, 12) === "application/")) {
              continue;
            }
          }
          types[extension2] = type;
        }
      });
    }
  }
});

// node_modules/asynckit/lib/defer.js
var require_defer = __commonJS({
  "node_modules/asynckit/lib/defer.js"(exports2, module2) {
    module2.exports = defer;
    function defer(fn) {
      var nextTick = typeof setImmediate == "function" ? setImmediate : typeof process == "object" && typeof process.nextTick == "function" ? process.nextTick : null;
      if (nextTick) {
        nextTick(fn);
      } else {
        setTimeout(fn, 0);
      }
    }
  }
});

// node_modules/asynckit/lib/async.js
var require_async = __commonJS({
  "node_modules/asynckit/lib/async.js"(exports2, module2) {
    var defer = require_defer();
    module2.exports = async;
    function async(callback) {
      var isAsync = false;
      defer(function() {
        isAsync = true;
      });
      return function async_callback(err, result) {
        if (isAsync) {
          callback(err, result);
        } else {
          defer(function nextTick_callback() {
            callback(err, result);
          });
        }
      };
    }
  }
});

// node_modules/asynckit/lib/abort.js
var require_abort = __commonJS({
  "node_modules/asynckit/lib/abort.js"(exports2, module2) {
    module2.exports = abort;
    function abort(state) {
      Object.keys(state.jobs).forEach(clean.bind(state));
      state.jobs = {};
    }
    function clean(key) {
      if (typeof this.jobs[key] == "function") {
        this.jobs[key]();
      }
    }
  }
});

// node_modules/asynckit/lib/iterate.js
var require_iterate = __commonJS({
  "node_modules/asynckit/lib/iterate.js"(exports2, module2) {
    var async = require_async();
    var abort = require_abort();
    module2.exports = iterate;
    function iterate(list, iterator, state, callback) {
      var key = state["keyedList"] ? state["keyedList"][state.index] : state.index;
      state.jobs[key] = runJob(iterator, key, list[key], function(error, output) {
        if (!(key in state.jobs)) {
          return;
        }
        delete state.jobs[key];
        if (error) {
          abort(state);
        } else {
          state.results[key] = output;
        }
        callback(error, state.results);
      });
    }
    function runJob(iterator, key, item, callback) {
      var aborter;
      if (iterator.length == 2) {
        aborter = iterator(item, async(callback));
      } else {
        aborter = iterator(item, key, async(callback));
      }
      return aborter;
    }
  }
});

// node_modules/asynckit/lib/state.js
var require_state = __commonJS({
  "node_modules/asynckit/lib/state.js"(exports2, module2) {
    module2.exports = state;
    function state(list, sortMethod) {
      var isNamedList = !Array.isArray(list), initState = {
        index: 0,
        keyedList: isNamedList || sortMethod ? Object.keys(list) : null,
        jobs: {},
        results: isNamedList ? {} : [],
        size: isNamedList ? Object.keys(list).length : list.length
      };
      if (sortMethod) {
        initState.keyedList.sort(isNamedList ? sortMethod : function(a, b) {
          return sortMethod(list[a], list[b]);
        });
      }
      return initState;
    }
  }
});

// node_modules/asynckit/lib/terminator.js
var require_terminator = __commonJS({
  "node_modules/asynckit/lib/terminator.js"(exports2, module2) {
    var abort = require_abort();
    var async = require_async();
    module2.exports = terminator;
    function terminator(callback) {
      if (!Object.keys(this.jobs).length) {
        return;
      }
      this.index = this.size;
      abort(this);
      async(callback)(null, this.results);
    }
  }
});

// node_modules/asynckit/parallel.js
var require_parallel = __commonJS({
  "node_modules/asynckit/parallel.js"(exports2, module2) {
    var iterate = require_iterate();
    var initState = require_state();
    var terminator = require_terminator();
    module2.exports = parallel;
    function parallel(list, iterator, callback) {
      var state = initState(list);
      while (state.index < (state["keyedList"] || list).length) {
        iterate(list, iterator, state, function(error, result) {
          if (error) {
            callback(error, result);
            return;
          }
          if (Object.keys(state.jobs).length === 0) {
            callback(null, state.results);
            return;
          }
        });
        state.index++;
      }
      return terminator.bind(state, callback);
    }
  }
});

// node_modules/asynckit/serialOrdered.js
var require_serialOrdered = __commonJS({
  "node_modules/asynckit/serialOrdered.js"(exports2, module2) {
    var iterate = require_iterate();
    var initState = require_state();
    var terminator = require_terminator();
    module2.exports = serialOrdered;
    module2.exports.ascending = ascending;
    module2.exports.descending = descending;
    function serialOrdered(list, iterator, sortMethod, callback) {
      var state = initState(list, sortMethod);
      iterate(list, iterator, state, function iteratorHandler(error, result) {
        if (error) {
          callback(error, result);
          return;
        }
        state.index++;
        if (state.index < (state["keyedList"] || list).length) {
          iterate(list, iterator, state, iteratorHandler);
          return;
        }
        callback(null, state.results);
      });
      return terminator.bind(state, callback);
    }
    function ascending(a, b) {
      return a < b ? -1 : a > b ? 1 : 0;
    }
    function descending(a, b) {
      return -1 * ascending(a, b);
    }
  }
});

// node_modules/asynckit/serial.js
var require_serial = __commonJS({
  "node_modules/asynckit/serial.js"(exports2, module2) {
    var serialOrdered = require_serialOrdered();
    module2.exports = serial;
    function serial(list, iterator, callback) {
      return serialOrdered(list, iterator, null, callback);
    }
  }
});

// node_modules/asynckit/index.js
var require_asynckit = __commonJS({
  "node_modules/asynckit/index.js"(exports2, module2) {
    module2.exports = {
      parallel: require_parallel(),
      serial: require_serial(),
      serialOrdered: require_serialOrdered()
    };
  }
});

// node_modules/es-object-atoms/index.js
var require_es_object_atoms = __commonJS({
  "node_modules/es-object-atoms/index.js"(exports2, module2) {
    "use strict";
    module2.exports = Object;
  }
});

// node_modules/es-errors/index.js
var require_es_errors = __commonJS({
  "node_modules/es-errors/index.js"(exports2, module2) {
    "use strict";
    module2.exports = Error;
  }
});

// node_modules/es-errors/eval.js
var require_eval = __commonJS({
  "node_modules/es-errors/eval.js"(exports2, module2) {
    "use strict";
    module2.exports = EvalError;
  }
});

// node_modules/es-errors/range.js
var require_range = __commonJS({
  "node_modules/es-errors/range.js"(exports2, module2) {
    "use strict";
    module2.exports = RangeError;
  }
});

// node_modules/es-errors/ref.js
var require_ref = __commonJS({
  "node_modules/es-errors/ref.js"(exports2, module2) {
    "use strict";
    module2.exports = ReferenceError;
  }
});

// node_modules/es-errors/syntax.js
var require_syntax = __commonJS({
  "node_modules/es-errors/syntax.js"(exports2, module2) {
    "use strict";
    module2.exports = SyntaxError;
  }
});

// node_modules/es-errors/type.js
var require_type = __commonJS({
  "node_modules/es-errors/type.js"(exports2, module2) {
    "use strict";
    module2.exports = TypeError;
  }
});

// node_modules/es-errors/uri.js
var require_uri = __commonJS({
  "node_modules/es-errors/uri.js"(exports2, module2) {
    "use strict";
    module2.exports = URIError;
  }
});

// node_modules/math-intrinsics/abs.js
var require_abs = __commonJS({
  "node_modules/math-intrinsics/abs.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.abs;
  }
});

// node_modules/math-intrinsics/floor.js
var require_floor = __commonJS({
  "node_modules/math-intrinsics/floor.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.floor;
  }
});

// node_modules/math-intrinsics/max.js
var require_max = __commonJS({
  "node_modules/math-intrinsics/max.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.max;
  }
});

// node_modules/math-intrinsics/min.js
var require_min = __commonJS({
  "node_modules/math-intrinsics/min.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.min;
  }
});

// node_modules/math-intrinsics/pow.js
var require_pow = __commonJS({
  "node_modules/math-intrinsics/pow.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.pow;
  }
});

// node_modules/math-intrinsics/round.js
var require_round = __commonJS({
  "node_modules/math-intrinsics/round.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.round;
  }
});

// node_modules/math-intrinsics/isNaN.js
var require_isNaN = __commonJS({
  "node_modules/math-intrinsics/isNaN.js"(exports2, module2) {
    "use strict";
    module2.exports = Number.isNaN || function isNaN2(a) {
      return a !== a;
    };
  }
});

// node_modules/math-intrinsics/sign.js
var require_sign = __commonJS({
  "node_modules/math-intrinsics/sign.js"(exports2, module2) {
    "use strict";
    var $isNaN = require_isNaN();
    module2.exports = function sign(number) {
      if ($isNaN(number) || number === 0) {
        return number;
      }
      return number < 0 ? -1 : 1;
    };
  }
});

// node_modules/gopd/gOPD.js
var require_gOPD = __commonJS({
  "node_modules/gopd/gOPD.js"(exports2, module2) {
    "use strict";
    module2.exports = Object.getOwnPropertyDescriptor;
  }
});

// node_modules/gopd/index.js
var require_gopd = __commonJS({
  "node_modules/gopd/index.js"(exports2, module2) {
    "use strict";
    var $gOPD = require_gOPD();
    if ($gOPD) {
      try {
        $gOPD([], "length");
      } catch (e) {
        $gOPD = null;
      }
    }
    module2.exports = $gOPD;
  }
});

// node_modules/es-define-property/index.js
var require_es_define_property = __commonJS({
  "node_modules/es-define-property/index.js"(exports2, module2) {
    "use strict";
    var $defineProperty = Object.defineProperty || false;
    if ($defineProperty) {
      try {
        $defineProperty({}, "a", { value: 1 });
      } catch (e) {
        $defineProperty = false;
      }
    }
    module2.exports = $defineProperty;
  }
});

// node_modules/has-symbols/shams.js
var require_shams = __commonJS({
  "node_modules/has-symbols/shams.js"(exports2, module2) {
    "use strict";
    module2.exports = function hasSymbols() {
      if (typeof Symbol !== "function" || typeof Object.getOwnPropertySymbols !== "function") {
        return false;
      }
      if (typeof Symbol.iterator === "symbol") {
        return true;
      }
      var obj = {};
      var sym = /* @__PURE__ */ Symbol("test");
      var symObj = Object(sym);
      if (typeof sym === "string") {
        return false;
      }
      if (Object.prototype.toString.call(sym) !== "[object Symbol]") {
        return false;
      }
      if (Object.prototype.toString.call(symObj) !== "[object Symbol]") {
        return false;
      }
      var symVal = 42;
      obj[sym] = symVal;
      for (var _ in obj) {
        return false;
      }
      if (typeof Object.keys === "function" && Object.keys(obj).length !== 0) {
        return false;
      }
      if (typeof Object.getOwnPropertyNames === "function" && Object.getOwnPropertyNames(obj).length !== 0) {
        return false;
      }
      var syms = Object.getOwnPropertySymbols(obj);
      if (syms.length !== 1 || syms[0] !== sym) {
        return false;
      }
      if (!Object.prototype.propertyIsEnumerable.call(obj, sym)) {
        return false;
      }
      if (typeof Object.getOwnPropertyDescriptor === "function") {
        var descriptor = (
          /** @type {PropertyDescriptor} */
          Object.getOwnPropertyDescriptor(obj, sym)
        );
        if (descriptor.value !== symVal || descriptor.enumerable !== true) {
          return false;
        }
      }
      return true;
    };
  }
});

// node_modules/has-symbols/index.js
var require_has_symbols = __commonJS({
  "node_modules/has-symbols/index.js"(exports2, module2) {
    "use strict";
    var origSymbol = typeof Symbol !== "undefined" && Symbol;
    var hasSymbolSham = require_shams();
    module2.exports = function hasNativeSymbols() {
      if (typeof origSymbol !== "function") {
        return false;
      }
      if (typeof Symbol !== "function") {
        return false;
      }
      if (typeof origSymbol("foo") !== "symbol") {
        return false;
      }
      if (typeof /* @__PURE__ */ Symbol("bar") !== "symbol") {
        return false;
      }
      return hasSymbolSham();
    };
  }
});

// node_modules/get-proto/Reflect.getPrototypeOf.js
var require_Reflect_getPrototypeOf = __commonJS({
  "node_modules/get-proto/Reflect.getPrototypeOf.js"(exports2, module2) {
    "use strict";
    module2.exports = typeof Reflect !== "undefined" && Reflect.getPrototypeOf || null;
  }
});

// node_modules/get-proto/Object.getPrototypeOf.js
var require_Object_getPrototypeOf = __commonJS({
  "node_modules/get-proto/Object.getPrototypeOf.js"(exports2, module2) {
    "use strict";
    var $Object = require_es_object_atoms();
    module2.exports = $Object.getPrototypeOf || null;
  }
});

// node_modules/function-bind/implementation.js
var require_implementation = __commonJS({
  "node_modules/function-bind/implementation.js"(exports2, module2) {
    "use strict";
    var ERROR_MESSAGE = "Function.prototype.bind called on incompatible ";
    var toStr = Object.prototype.toString;
    var max2 = Math.max;
    var funcType = "[object Function]";
    var concatty = function concatty2(a, b) {
      var arr = [];
      for (var i = 0; i < a.length; i += 1) {
        arr[i] = a[i];
      }
      for (var j = 0; j < b.length; j += 1) {
        arr[j + a.length] = b[j];
      }
      return arr;
    };
    var slicy = function slicy2(arrLike, offset) {
      var arr = [];
      for (var i = offset || 0, j = 0; i < arrLike.length; i += 1, j += 1) {
        arr[j] = arrLike[i];
      }
      return arr;
    };
    var joiny = function(arr, joiner) {
      var str = "";
      for (var i = 0; i < arr.length; i += 1) {
        str += arr[i];
        if (i + 1 < arr.length) {
          str += joiner;
        }
      }
      return str;
    };
    module2.exports = function bind(that) {
      var target = this;
      if (typeof target !== "function" || toStr.apply(target) !== funcType) {
        throw new TypeError(ERROR_MESSAGE + target);
      }
      var args = slicy(arguments, 1);
      var bound;
      var binder = function() {
        if (this instanceof bound) {
          var result = target.apply(
            this,
            concatty(args, arguments)
          );
          if (Object(result) === result) {
            return result;
          }
          return this;
        }
        return target.apply(
          that,
          concatty(args, arguments)
        );
      };
      var boundLength = max2(0, target.length - args.length);
      var boundArgs = [];
      for (var i = 0; i < boundLength; i++) {
        boundArgs[i] = "$" + i;
      }
      bound = Function("binder", "return function (" + joiny(boundArgs, ",") + "){ return binder.apply(this,arguments); }")(binder);
      if (target.prototype) {
        var Empty = function Empty2() {
        };
        Empty.prototype = target.prototype;
        bound.prototype = new Empty();
        Empty.prototype = null;
      }
      return bound;
    };
  }
});

// node_modules/function-bind/index.js
var require_function_bind = __commonJS({
  "node_modules/function-bind/index.js"(exports2, module2) {
    "use strict";
    var implementation = require_implementation();
    module2.exports = Function.prototype.bind || implementation;
  }
});

// node_modules/call-bind-apply-helpers/functionCall.js
var require_functionCall = __commonJS({
  "node_modules/call-bind-apply-helpers/functionCall.js"(exports2, module2) {
    "use strict";
    module2.exports = Function.prototype.call;
  }
});

// node_modules/call-bind-apply-helpers/functionApply.js
var require_functionApply = __commonJS({
  "node_modules/call-bind-apply-helpers/functionApply.js"(exports2, module2) {
    "use strict";
    module2.exports = Function.prototype.apply;
  }
});

// node_modules/call-bind-apply-helpers/reflectApply.js
var require_reflectApply = __commonJS({
  "node_modules/call-bind-apply-helpers/reflectApply.js"(exports2, module2) {
    "use strict";
    module2.exports = typeof Reflect !== "undefined" && Reflect && Reflect.apply;
  }
});

// node_modules/call-bind-apply-helpers/actualApply.js
var require_actualApply = __commonJS({
  "node_modules/call-bind-apply-helpers/actualApply.js"(exports2, module2) {
    "use strict";
    var bind = require_function_bind();
    var $apply = require_functionApply();
    var $call = require_functionCall();
    var $reflectApply = require_reflectApply();
    module2.exports = $reflectApply || bind.call($call, $apply);
  }
});

// node_modules/call-bind-apply-helpers/index.js
var require_call_bind_apply_helpers = __commonJS({
  "node_modules/call-bind-apply-helpers/index.js"(exports2, module2) {
    "use strict";
    var bind = require_function_bind();
    var $TypeError = require_type();
    var $call = require_functionCall();
    var $actualApply = require_actualApply();
    module2.exports = function callBindBasic(args) {
      if (args.length < 1 || typeof args[0] !== "function") {
        throw new $TypeError("a function is required");
      }
      return $actualApply(bind, $call, args);
    };
  }
});

// node_modules/dunder-proto/get.js
var require_get = __commonJS({
  "node_modules/dunder-proto/get.js"(exports2, module2) {
    "use strict";
    var callBind = require_call_bind_apply_helpers();
    var gOPD = require_gopd();
    var hasProtoAccessor;
    try {
      hasProtoAccessor = /** @type {{ __proto__?: typeof Array.prototype }} */
      [].__proto__ === Array.prototype;
    } catch (e) {
      if (!e || typeof e !== "object" || !("code" in e) || e.code !== "ERR_PROTO_ACCESS") {
        throw e;
      }
    }
    var desc = !!hasProtoAccessor && gOPD && gOPD(
      Object.prototype,
      /** @type {keyof typeof Object.prototype} */
      "__proto__"
    );
    var $Object = Object;
    var $getPrototypeOf = $Object.getPrototypeOf;
    module2.exports = desc && typeof desc.get === "function" ? callBind([desc.get]) : typeof $getPrototypeOf === "function" ? (
      /** @type {import('./get')} */
      function getDunder(value) {
        return $getPrototypeOf(value == null ? value : $Object(value));
      }
    ) : false;
  }
});

// node_modules/get-proto/index.js
var require_get_proto = __commonJS({
  "node_modules/get-proto/index.js"(exports2, module2) {
    "use strict";
    var reflectGetProto = require_Reflect_getPrototypeOf();
    var originalGetProto = require_Object_getPrototypeOf();
    var getDunderProto = require_get();
    module2.exports = reflectGetProto ? function getProto(O) {
      return reflectGetProto(O);
    } : originalGetProto ? function getProto(O) {
      if (!O || typeof O !== "object" && typeof O !== "function") {
        throw new TypeError("getProto: not an object");
      }
      return originalGetProto(O);
    } : getDunderProto ? function getProto(O) {
      return getDunderProto(O);
    } : null;
  }
});

// node_modules/hasown/index.js
var require_hasown = __commonJS({
  "node_modules/hasown/index.js"(exports2, module2) {
    "use strict";
    var call = Function.prototype.call;
    var $hasOwn = Object.prototype.hasOwnProperty;
    var bind = require_function_bind();
    module2.exports = bind.call(call, $hasOwn);
  }
});

// node_modules/get-intrinsic/index.js
var require_get_intrinsic = __commonJS({
  "node_modules/get-intrinsic/index.js"(exports2, module2) {
    "use strict";
    var undefined2;
    var $Object = require_es_object_atoms();
    var $Error = require_es_errors();
    var $EvalError = require_eval();
    var $RangeError = require_range();
    var $ReferenceError = require_ref();
    var $SyntaxError = require_syntax();
    var $TypeError = require_type();
    var $URIError = require_uri();
    var abs = require_abs();
    var floor = require_floor();
    var max2 = require_max();
    var min = require_min();
    var pow = require_pow();
    var round = require_round();
    var sign = require_sign();
    var $Function = Function;
    var getEvalledConstructor = function(expressionSyntax) {
      try {
        return $Function('"use strict"; return (' + expressionSyntax + ").constructor;")();
      } catch (e) {
      }
    };
    var $gOPD = require_gopd();
    var $defineProperty = require_es_define_property();
    var throwTypeError = function() {
      throw new $TypeError();
    };
    var ThrowTypeError = $gOPD ? (function() {
      try {
        arguments.callee;
        return throwTypeError;
      } catch (calleeThrows) {
        try {
          return $gOPD(arguments, "callee").get;
        } catch (gOPDthrows) {
          return throwTypeError;
        }
      }
    })() : throwTypeError;
    var hasSymbols = require_has_symbols()();
    var getProto = require_get_proto();
    var $ObjectGPO = require_Object_getPrototypeOf();
    var $ReflectGPO = require_Reflect_getPrototypeOf();
    var $apply = require_functionApply();
    var $call = require_functionCall();
    var needsEval = {};
    var TypedArray = typeof Uint8Array === "undefined" || !getProto ? undefined2 : getProto(Uint8Array);
    var INTRINSICS = {
      __proto__: null,
      "%AggregateError%": typeof AggregateError === "undefined" ? undefined2 : AggregateError,
      "%Array%": Array,
      "%ArrayBuffer%": typeof ArrayBuffer === "undefined" ? undefined2 : ArrayBuffer,
      "%ArrayIteratorPrototype%": hasSymbols && getProto ? getProto([][Symbol.iterator]()) : undefined2,
      "%AsyncFromSyncIteratorPrototype%": undefined2,
      "%AsyncFunction%": needsEval,
      "%AsyncGenerator%": needsEval,
      "%AsyncGeneratorFunction%": needsEval,
      "%AsyncIteratorPrototype%": needsEval,
      "%Atomics%": typeof Atomics === "undefined" ? undefined2 : Atomics,
      "%BigInt%": typeof BigInt === "undefined" ? undefined2 : BigInt,
      "%BigInt64Array%": typeof BigInt64Array === "undefined" ? undefined2 : BigInt64Array,
      "%BigUint64Array%": typeof BigUint64Array === "undefined" ? undefined2 : BigUint64Array,
      "%Boolean%": Boolean,
      "%DataView%": typeof DataView === "undefined" ? undefined2 : DataView,
      "%Date%": Date,
      "%decodeURI%": decodeURI,
      "%decodeURIComponent%": decodeURIComponent,
      "%encodeURI%": encodeURI,
      "%encodeURIComponent%": encodeURIComponent,
      "%Error%": $Error,
      "%eval%": eval,
      // eslint-disable-line no-eval
      "%EvalError%": $EvalError,
      "%Float16Array%": typeof Float16Array === "undefined" ? undefined2 : Float16Array,
      "%Float32Array%": typeof Float32Array === "undefined" ? undefined2 : Float32Array,
      "%Float64Array%": typeof Float64Array === "undefined" ? undefined2 : Float64Array,
      "%FinalizationRegistry%": typeof FinalizationRegistry === "undefined" ? undefined2 : FinalizationRegistry,
      "%Function%": $Function,
      "%GeneratorFunction%": needsEval,
      "%Int8Array%": typeof Int8Array === "undefined" ? undefined2 : Int8Array,
      "%Int16Array%": typeof Int16Array === "undefined" ? undefined2 : Int16Array,
      "%Int32Array%": typeof Int32Array === "undefined" ? undefined2 : Int32Array,
      "%isFinite%": isFinite,
      "%isNaN%": isNaN,
      "%IteratorPrototype%": hasSymbols && getProto ? getProto(getProto([][Symbol.iterator]())) : undefined2,
      "%JSON%": typeof JSON === "object" ? JSON : undefined2,
      "%Map%": typeof Map === "undefined" ? undefined2 : Map,
      "%MapIteratorPrototype%": typeof Map === "undefined" || !hasSymbols || !getProto ? undefined2 : getProto((/* @__PURE__ */ new Map())[Symbol.iterator]()),
      "%Math%": Math,
      "%Number%": Number,
      "%Object%": $Object,
      "%Object.getOwnPropertyDescriptor%": $gOPD,
      "%parseFloat%": parseFloat,
      "%parseInt%": parseInt,
      "%Promise%": typeof Promise === "undefined" ? undefined2 : Promise,
      "%Proxy%": typeof Proxy === "undefined" ? undefined2 : Proxy,
      "%RangeError%": $RangeError,
      "%ReferenceError%": $ReferenceError,
      "%Reflect%": typeof Reflect === "undefined" ? undefined2 : Reflect,
      "%RegExp%": RegExp,
      "%Set%": typeof Set === "undefined" ? undefined2 : Set,
      "%SetIteratorPrototype%": typeof Set === "undefined" || !hasSymbols || !getProto ? undefined2 : getProto((/* @__PURE__ */ new Set())[Symbol.iterator]()),
      "%SharedArrayBuffer%": typeof SharedArrayBuffer === "undefined" ? undefined2 : SharedArrayBuffer,
      "%String%": String,
      "%StringIteratorPrototype%": hasSymbols && getProto ? getProto(""[Symbol.iterator]()) : undefined2,
      "%Symbol%": hasSymbols ? Symbol : undefined2,
      "%SyntaxError%": $SyntaxError,
      "%ThrowTypeError%": ThrowTypeError,
      "%TypedArray%": TypedArray,
      "%TypeError%": $TypeError,
      "%Uint8Array%": typeof Uint8Array === "undefined" ? undefined2 : Uint8Array,
      "%Uint8ClampedArray%": typeof Uint8ClampedArray === "undefined" ? undefined2 : Uint8ClampedArray,
      "%Uint16Array%": typeof Uint16Array === "undefined" ? undefined2 : Uint16Array,
      "%Uint32Array%": typeof Uint32Array === "undefined" ? undefined2 : Uint32Array,
      "%URIError%": $URIError,
      "%WeakMap%": typeof WeakMap === "undefined" ? undefined2 : WeakMap,
      "%WeakRef%": typeof WeakRef === "undefined" ? undefined2 : WeakRef,
      "%WeakSet%": typeof WeakSet === "undefined" ? undefined2 : WeakSet,
      "%Function.prototype.call%": $call,
      "%Function.prototype.apply%": $apply,
      "%Object.defineProperty%": $defineProperty,
      "%Object.getPrototypeOf%": $ObjectGPO,
      "%Math.abs%": abs,
      "%Math.floor%": floor,
      "%Math.max%": max2,
      "%Math.min%": min,
      "%Math.pow%": pow,
      "%Math.round%": round,
      "%Math.sign%": sign,
      "%Reflect.getPrototypeOf%": $ReflectGPO
    };
    if (getProto) {
      try {
        null.error;
      } catch (e) {
        errorProto = getProto(getProto(e));
        INTRINSICS["%Error.prototype%"] = errorProto;
      }
    }
    var errorProto;
    var doEval = function doEval2(name) {
      var value;
      if (name === "%AsyncFunction%") {
        value = getEvalledConstructor("async function () {}");
      } else if (name === "%GeneratorFunction%") {
        value = getEvalledConstructor("function* () {}");
      } else if (name === "%AsyncGeneratorFunction%") {
        value = getEvalledConstructor("async function* () {}");
      } else if (name === "%AsyncGenerator%") {
        var fn = doEval2("%AsyncGeneratorFunction%");
        if (fn) {
          value = fn.prototype;
        }
      } else if (name === "%AsyncIteratorPrototype%") {
        var gen = doEval2("%AsyncGenerator%");
        if (gen && getProto) {
          value = getProto(gen.prototype);
        }
      }
      INTRINSICS[name] = value;
      return value;
    };
    var LEGACY_ALIASES = {
      __proto__: null,
      "%ArrayBufferPrototype%": ["ArrayBuffer", "prototype"],
      "%ArrayPrototype%": ["Array", "prototype"],
      "%ArrayProto_entries%": ["Array", "prototype", "entries"],
      "%ArrayProto_forEach%": ["Array", "prototype", "forEach"],
      "%ArrayProto_keys%": ["Array", "prototype", "keys"],
      "%ArrayProto_values%": ["Array", "prototype", "values"],
      "%AsyncFunctionPrototype%": ["AsyncFunction", "prototype"],
      "%AsyncGenerator%": ["AsyncGeneratorFunction", "prototype"],
      "%AsyncGeneratorPrototype%": ["AsyncGeneratorFunction", "prototype", "prototype"],
      "%BooleanPrototype%": ["Boolean", "prototype"],
      "%DataViewPrototype%": ["DataView", "prototype"],
      "%DatePrototype%": ["Date", "prototype"],
      "%ErrorPrototype%": ["Error", "prototype"],
      "%EvalErrorPrototype%": ["EvalError", "prototype"],
      "%Float32ArrayPrototype%": ["Float32Array", "prototype"],
      "%Float64ArrayPrototype%": ["Float64Array", "prototype"],
      "%FunctionPrototype%": ["Function", "prototype"],
      "%Generator%": ["GeneratorFunction", "prototype"],
      "%GeneratorPrototype%": ["GeneratorFunction", "prototype", "prototype"],
      "%Int8ArrayPrototype%": ["Int8Array", "prototype"],
      "%Int16ArrayPrototype%": ["Int16Array", "prototype"],
      "%Int32ArrayPrototype%": ["Int32Array", "prototype"],
      "%JSONParse%": ["JSON", "parse"],
      "%JSONStringify%": ["JSON", "stringify"],
      "%MapPrototype%": ["Map", "prototype"],
      "%NumberPrototype%": ["Number", "prototype"],
      "%ObjectPrototype%": ["Object", "prototype"],
      "%ObjProto_toString%": ["Object", "prototype", "toString"],
      "%ObjProto_valueOf%": ["Object", "prototype", "valueOf"],
      "%PromisePrototype%": ["Promise", "prototype"],
      "%PromiseProto_then%": ["Promise", "prototype", "then"],
      "%Promise_all%": ["Promise", "all"],
      "%Promise_reject%": ["Promise", "reject"],
      "%Promise_resolve%": ["Promise", "resolve"],
      "%RangeErrorPrototype%": ["RangeError", "prototype"],
      "%ReferenceErrorPrototype%": ["ReferenceError", "prototype"],
      "%RegExpPrototype%": ["RegExp", "prototype"],
      "%SetPrototype%": ["Set", "prototype"],
      "%SharedArrayBufferPrototype%": ["SharedArrayBuffer", "prototype"],
      "%StringPrototype%": ["String", "prototype"],
      "%SymbolPrototype%": ["Symbol", "prototype"],
      "%SyntaxErrorPrototype%": ["SyntaxError", "prototype"],
      "%TypedArrayPrototype%": ["TypedArray", "prototype"],
      "%TypeErrorPrototype%": ["TypeError", "prototype"],
      "%Uint8ArrayPrototype%": ["Uint8Array", "prototype"],
      "%Uint8ClampedArrayPrototype%": ["Uint8ClampedArray", "prototype"],
      "%Uint16ArrayPrototype%": ["Uint16Array", "prototype"],
      "%Uint32ArrayPrototype%": ["Uint32Array", "prototype"],
      "%URIErrorPrototype%": ["URIError", "prototype"],
      "%WeakMapPrototype%": ["WeakMap", "prototype"],
      "%WeakSetPrototype%": ["WeakSet", "prototype"]
    };
    var bind = require_function_bind();
    var hasOwn = require_hasown();
    var $concat = bind.call($call, Array.prototype.concat);
    var $spliceApply = bind.call($apply, Array.prototype.splice);
    var $replace = bind.call($call, String.prototype.replace);
    var $strSlice = bind.call($call, String.prototype.slice);
    var $exec = bind.call($call, RegExp.prototype.exec);
    var rePropName = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g;
    var reEscapeChar = /\\(\\)?/g;
    var stringToPath = function stringToPath2(string) {
      var first = $strSlice(string, 0, 1);
      var last = $strSlice(string, -1);
      if (first === "%" && last !== "%") {
        throw new $SyntaxError("invalid intrinsic syntax, expected closing `%`");
      } else if (last === "%" && first !== "%") {
        throw new $SyntaxError("invalid intrinsic syntax, expected opening `%`");
      }
      var result = [];
      $replace(string, rePropName, function(match, number, quote, subString) {
        result[result.length] = quote ? $replace(subString, reEscapeChar, "$1") : number || match;
      });
      return result;
    };
    var getBaseIntrinsic = function getBaseIntrinsic2(name, allowMissing) {
      var intrinsicName = name;
      var alias2;
      if (hasOwn(LEGACY_ALIASES, intrinsicName)) {
        alias2 = LEGACY_ALIASES[intrinsicName];
        intrinsicName = "%" + alias2[0] + "%";
      }
      if (hasOwn(INTRINSICS, intrinsicName)) {
        var value = INTRINSICS[intrinsicName];
        if (value === needsEval) {
          value = doEval(intrinsicName);
        }
        if (typeof value === "undefined" && !allowMissing) {
          throw new $TypeError("intrinsic " + name + " exists, but is not available. Please file an issue!");
        }
        return {
          alias: alias2,
          name: intrinsicName,
          value
        };
      }
      throw new $SyntaxError("intrinsic " + name + " does not exist!");
    };
    module2.exports = function GetIntrinsic(name, allowMissing) {
      if (typeof name !== "string" || name.length === 0) {
        throw new $TypeError("intrinsic name must be a non-empty string");
      }
      if (arguments.length > 1 && typeof allowMissing !== "boolean") {
        throw new $TypeError('"allowMissing" argument must be a boolean');
      }
      if ($exec(/^%?[^%]*%?$/, name) === null) {
        throw new $SyntaxError("`%` may not be present anywhere but at the beginning and end of the intrinsic name");
      }
      var parts = stringToPath(name);
      var intrinsicBaseName = parts.length > 0 ? parts[0] : "";
      var intrinsic = getBaseIntrinsic("%" + intrinsicBaseName + "%", allowMissing);
      var intrinsicRealName = intrinsic.name;
      var value = intrinsic.value;
      var skipFurtherCaching = false;
      var alias2 = intrinsic.alias;
      if (alias2) {
        intrinsicBaseName = alias2[0];
        $spliceApply(parts, $concat([0, 1], alias2));
      }
      for (var i = 1, isOwn = true; i < parts.length; i += 1) {
        var part = parts[i];
        var first = $strSlice(part, 0, 1);
        var last = $strSlice(part, -1);
        if ((first === '"' || first === "'" || first === "`" || (last === '"' || last === "'" || last === "`")) && first !== last) {
          throw new $SyntaxError("property names with quotes must have matching quotes");
        }
        if (part === "constructor" || !isOwn) {
          skipFurtherCaching = true;
        }
        intrinsicBaseName += "." + part;
        intrinsicRealName = "%" + intrinsicBaseName + "%";
        if (hasOwn(INTRINSICS, intrinsicRealName)) {
          value = INTRINSICS[intrinsicRealName];
        } else if (value != null) {
          if (!(part in value)) {
            if (!allowMissing) {
              throw new $TypeError("base intrinsic for " + name + " exists, but the property is not available.");
            }
            return void undefined2;
          }
          if ($gOPD && i + 1 >= parts.length) {
            var desc = $gOPD(value, part);
            isOwn = !!desc;
            if (isOwn && "get" in desc && !("originalValue" in desc.get)) {
              value = desc.get;
            } else {
              value = value[part];
            }
          } else {
            isOwn = hasOwn(value, part);
            value = value[part];
          }
          if (isOwn && !skipFurtherCaching) {
            INTRINSICS[intrinsicRealName] = value;
          }
        }
      }
      return value;
    };
  }
});

// node_modules/has-tostringtag/shams.js
var require_shams2 = __commonJS({
  "node_modules/has-tostringtag/shams.js"(exports2, module2) {
    "use strict";
    var hasSymbols = require_shams();
    module2.exports = function hasToStringTagShams() {
      return hasSymbols() && !!Symbol.toStringTag;
    };
  }
});

// node_modules/es-set-tostringtag/index.js
var require_es_set_tostringtag = __commonJS({
  "node_modules/es-set-tostringtag/index.js"(exports2, module2) {
    "use strict";
    var GetIntrinsic = require_get_intrinsic();
    var $defineProperty = GetIntrinsic("%Object.defineProperty%", true);
    var hasToStringTag = require_shams2()();
    var hasOwn = require_hasown();
    var $TypeError = require_type();
    var toStringTag = hasToStringTag ? Symbol.toStringTag : null;
    module2.exports = function setToStringTag(object, value) {
      var overrideIfSet = arguments.length > 2 && !!arguments[2] && arguments[2].force;
      var nonConfigurable = arguments.length > 2 && !!arguments[2] && arguments[2].nonConfigurable;
      if (typeof overrideIfSet !== "undefined" && typeof overrideIfSet !== "boolean" || typeof nonConfigurable !== "undefined" && typeof nonConfigurable !== "boolean") {
        throw new $TypeError("if provided, the `overrideIfSet` and `nonConfigurable` options must be booleans");
      }
      if (toStringTag && (overrideIfSet || !hasOwn(object, toStringTag))) {
        if ($defineProperty) {
          $defineProperty(object, toStringTag, {
            configurable: !nonConfigurable,
            enumerable: false,
            value,
            writable: false
          });
        } else {
          object[toStringTag] = value;
        }
      }
    };
  }
});

// node_modules/form-data/lib/populate.js
var require_populate = __commonJS({
  "node_modules/form-data/lib/populate.js"(exports2, module2) {
    "use strict";
    module2.exports = function(dst, src) {
      Object.keys(src).forEach(function(prop) {
        dst[prop] = dst[prop] || src[prop];
      });
      return dst;
    };
  }
});

// node_modules/form-data/lib/form_data.js
var require_form_data = __commonJS({
  "node_modules/form-data/lib/form_data.js"(exports2, module2) {
    "use strict";
    var CombinedStream = require_combined_stream();
    var util = require("util");
    var path2 = require("path");
    var http = require("http");
    var https = require("https");
    var parseUrl = require("url").parse;
    var fs2 = require("fs");
    var Stream = require("stream").Stream;
    var crypto4 = require("crypto");
    var mime = require_mime_types();
    var asynckit = require_asynckit();
    var setToStringTag = require_es_set_tostringtag();
    var hasOwn = require_hasown();
    var populate = require_populate();
    function escapeHeaderParam(str) {
      return String(str).replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/"/g, "%22");
    }
    function FormData(options) {
      if (!(this instanceof FormData)) {
        return new FormData(options);
      }
      this._overheadLength = 0;
      this._valueLength = 0;
      this._valuesToMeasure = [];
      CombinedStream.call(this);
      options = options || {};
      for (var option in options) {
        this[option] = options[option];
      }
    }
    util.inherits(FormData, CombinedStream);
    FormData.LINE_BREAK = "\r\n";
    FormData.DEFAULT_CONTENT_TYPE = "application/octet-stream";
    FormData.prototype.append = function(field, value, options) {
      options = options || {};
      if (typeof options === "string") {
        options = { filename: options };
      }
      var append = CombinedStream.prototype.append.bind(this);
      if (typeof value === "number" || value == null) {
        value = String(value);
      }
      if (Array.isArray(value)) {
        this._error(new Error("Arrays are not supported."));
        return;
      }
      var header = this._multiPartHeader(field, value, options);
      var footer = this._multiPartFooter();
      append(header);
      append(value);
      append(footer);
      this._trackLength(header, value, options);
    };
    FormData.prototype._trackLength = function(header, value, options) {
      var valueLength = 0;
      if (options.knownLength != null) {
        valueLength += Number(options.knownLength);
      } else if (Buffer.isBuffer(value)) {
        valueLength = value.length;
      } else if (typeof value === "string") {
        valueLength = Buffer.byteLength(value);
      }
      this._valueLength += valueLength;
      this._overheadLength += Buffer.byteLength(header) + FormData.LINE_BREAK.length;
      if (!value || !value.path && !(value.readable && hasOwn(value, "httpVersion")) && !(value instanceof Stream)) {
        return;
      }
      if (!options.knownLength) {
        this._valuesToMeasure.push(value);
      }
    };
    FormData.prototype._lengthRetriever = function(value, callback) {
      if (hasOwn(value, "fd")) {
        if (value.end != void 0 && value.end != Infinity && value.start != void 0) {
          callback(null, value.end + 1 - (value.start ? value.start : 0));
        } else {
          fs2.stat(value.path, function(err, stat) {
            if (err) {
              callback(err);
              return;
            }
            var fileSize = stat.size - (value.start ? value.start : 0);
            callback(null, fileSize);
          });
        }
      } else if (hasOwn(value, "httpVersion")) {
        callback(null, Number(value.headers["content-length"]));
      } else if (hasOwn(value, "httpModule")) {
        value.on("response", function(response) {
          value.pause();
          callback(null, Number(response.headers["content-length"]));
        });
        value.resume();
      } else {
        callback("Unknown stream");
      }
    };
    FormData.prototype._multiPartHeader = function(field, value, options) {
      if (typeof options.header === "string") {
        return options.header;
      }
      var contentDisposition = this._getContentDisposition(value, options);
      var contentType = this._getContentType(value, options);
      var contents = "";
      var headers = {
        // add custom disposition as third element or keep it two elements if not
        "Content-Disposition": ["form-data", 'name="' + escapeHeaderParam(field) + '"'].concat(contentDisposition || []),
        // if no content type. allow it to be empty array
        "Content-Type": [].concat(contentType || [])
      };
      if (typeof options.header === "object") {
        populate(headers, options.header);
      }
      var header;
      for (var prop in headers) {
        if (hasOwn(headers, prop)) {
          header = headers[prop];
          if (header == null) {
            continue;
          }
          if (!Array.isArray(header)) {
            header = [header];
          }
          if (header.length) {
            contents += prop + ": " + header.join("; ") + FormData.LINE_BREAK;
          }
        }
      }
      return "--" + this.getBoundary() + FormData.LINE_BREAK + contents + FormData.LINE_BREAK;
    };
    FormData.prototype._getContentDisposition = function(value, options) {
      var filename;
      if (typeof options.filepath === "string") {
        filename = path2.normalize(options.filepath).replace(/\\/g, "/");
      } else if (options.filename || value && (value.name || value.path)) {
        filename = path2.basename(options.filename || value && (value.name || value.path));
      } else if (value && value.readable && hasOwn(value, "httpVersion")) {
        filename = path2.basename(value.client._httpMessage.path || "");
      }
      if (filename) {
        return 'filename="' + escapeHeaderParam(filename) + '"';
      }
    };
    FormData.prototype._getContentType = function(value, options) {
      var contentType = options.contentType;
      if (!contentType && value && value.name) {
        contentType = mime.lookup(value.name);
      }
      if (!contentType && value && value.path) {
        contentType = mime.lookup(value.path);
      }
      if (!contentType && value && value.readable && hasOwn(value, "httpVersion")) {
        contentType = value.headers["content-type"];
      }
      if (!contentType && (options.filepath || options.filename)) {
        contentType = mime.lookup(options.filepath || options.filename);
      }
      if (!contentType && value && typeof value === "object") {
        contentType = FormData.DEFAULT_CONTENT_TYPE;
      }
      return contentType;
    };
    FormData.prototype._multiPartFooter = function() {
      return function(next) {
        var footer = FormData.LINE_BREAK;
        var lastPart = this._streams.length === 0;
        if (lastPart) {
          footer += this._lastBoundary();
        }
        next(footer);
      }.bind(this);
    };
    FormData.prototype._lastBoundary = function() {
      return "--" + this.getBoundary() + "--" + FormData.LINE_BREAK;
    };
    FormData.prototype.getHeaders = function(userHeaders) {
      var header;
      var formHeaders = {
        "content-type": "multipart/form-data; boundary=" + this.getBoundary()
      };
      for (header in userHeaders) {
        if (hasOwn(userHeaders, header)) {
          formHeaders[header.toLowerCase()] = userHeaders[header];
        }
      }
      return formHeaders;
    };
    FormData.prototype.setBoundary = function(boundary) {
      if (typeof boundary !== "string") {
        throw new TypeError("FormData boundary must be a string");
      }
      this._boundary = boundary;
    };
    FormData.prototype.getBoundary = function() {
      if (!this._boundary) {
        this._generateBoundary();
      }
      return this._boundary;
    };
    FormData.prototype.getBuffer = function() {
      var dataBuffer = new Buffer.alloc(0);
      var boundary = this.getBoundary();
      for (var i = 0, len = this._streams.length; i < len; i++) {
        if (typeof this._streams[i] !== "function") {
          if (Buffer.isBuffer(this._streams[i])) {
            dataBuffer = Buffer.concat([dataBuffer, this._streams[i]]);
          } else {
            dataBuffer = Buffer.concat([dataBuffer, Buffer.from(this._streams[i])]);
          }
          if (typeof this._streams[i] !== "string" || this._streams[i].substring(2, boundary.length + 2) !== boundary) {
            dataBuffer = Buffer.concat([dataBuffer, Buffer.from(FormData.LINE_BREAK)]);
          }
        }
      }
      return Buffer.concat([dataBuffer, Buffer.from(this._lastBoundary())]);
    };
    FormData.prototype._generateBoundary = function() {
      this._boundary = "--------------------------" + crypto4.randomBytes(12).toString("hex");
    };
    FormData.prototype.getLengthSync = function() {
      var knownLength = this._overheadLength + this._valueLength;
      if (this._streams.length) {
        knownLength += this._lastBoundary().length;
      }
      if (!this.hasKnownLength()) {
        this._error(new Error("Cannot calculate proper length in synchronous way."));
      }
      return knownLength;
    };
    FormData.prototype.hasKnownLength = function() {
      var hasKnownLength = true;
      if (this._valuesToMeasure.length) {
        hasKnownLength = false;
      }
      return hasKnownLength;
    };
    FormData.prototype.getLength = function(cb) {
      var knownLength = this._overheadLength + this._valueLength;
      if (this._streams.length) {
        knownLength += this._lastBoundary().length;
      }
      if (!this._valuesToMeasure.length) {
        process.nextTick(cb.bind(this, null, knownLength));
        return;
      }
      asynckit.parallel(this._valuesToMeasure, this._lengthRetriever, function(err, values) {
        if (err) {
          cb(err);
          return;
        }
        values.forEach(function(length) {
          knownLength += length;
        });
        cb(null, knownLength);
      });
    };
    FormData.prototype.submit = function(params, cb) {
      var request;
      var options;
      var defaults2 = { method: "post" };
      if (typeof params === "string") {
        params = parseUrl(params);
        options = populate({
          port: params.port,
          path: params.pathname,
          host: params.hostname,
          protocol: params.protocol
        }, defaults2);
      } else {
        options = populate(params, defaults2);
        if (!options.port) {
          options.port = options.protocol === "https:" ? 443 : 80;
        }
      }
      options.headers = this.getHeaders(params.headers);
      if (options.protocol === "https:") {
        request = https.request(options);
      } else {
        request = http.request(options);
      }
      this.getLength(function(err, length) {
        if (err && err !== "Unknown stream") {
          this._error(err);
          return;
        }
        if (length) {
          request.setHeader("Content-Length", length);
        }
        this.pipe(request);
        if (cb) {
          var onResponse;
          var callback = function(error, responce) {
            request.removeListener("error", callback);
            request.removeListener("response", onResponse);
            return cb.call(this, error, responce);
          };
          onResponse = callback.bind(this, null);
          request.on("error", callback);
          request.on("response", onResponse);
        }
      }.bind(this));
      return request;
    };
    FormData.prototype._error = function(err) {
      if (!this.error) {
        this.error = err;
        this.pause();
        this.emit("error", err);
      }
    };
    FormData.prototype.toString = function() {
      return "[object FormData]";
    };
    setToStringTag(FormData.prototype, "FormData");
    module2.exports = FormData;
  }
});

// node_modules/autocannon/lib/multipart.js
var require_multipart = __commonJS({
  "node_modules/autocannon/lib/multipart.js"(exports2, module2) {
    "use strict";
    var { resolve, basename } = require("path");
    var { readFileSync } = require("fs");
    var FormData = require_form_data();
    function getFormData(string) {
      try {
        return JSON.parse(string);
      } catch (error) {
        try {
          const path2 = resolve(string);
          const data = readFileSync(path2, "utf8");
          return JSON.parse(data);
        } catch (error2) {
          throw new Error("Invalid JSON or file where to get form data");
        }
      }
    }
    module2.exports = (options) => {
      const obj = typeof options === "string" ? getFormData(options) : options;
      const form = new FormData();
      for (const key in obj) {
        const type = obj[key] && obj[key].type;
        switch (type) {
          case "file": {
            const path2 = obj[key] && obj[key].path;
            if (!path2) {
              throw new Error(`Missing key 'path' in form object for key '${key}'`);
            }
            const opts = obj[key] && obj[key].options;
            const buffer = readFileSync(path2);
            form.append(key, buffer, Object.assign({}, {
              filename: basename(path2)
            }, opts));
            break;
          }
          case "text": {
            const value = obj[key] && obj[key].value;
            if (!value) {
              throw new Error(`Missing key 'value' in form object for key '${key}'`);
            }
            form.append(key, value);
            break;
          }
          default:
            throw new Error("A 'type' key with value 'text' or 'file' should be specified");
        }
      }
      return form;
    };
  }
});

// node_modules/autocannon/lib/parseHAR.js
var require_parseHAR = __commonJS({
  "node_modules/autocannon/lib/parseHAR.js"(exports2) {
    "use strict";
    var { parse: parse2 } = require("url");
    function parseHAR2(har) {
      const requestsPerOrigin = /* @__PURE__ */ new Map();
      try {
        if (!har || typeof har !== "object" || typeof har.log !== "object" || !Array.isArray(har.log.entries) || !har.log.entries.length) {
          throw new Error("no entries found");
        }
        let i = 0;
        for (const entry of har.log.entries) {
          i++;
          if (!entry || typeof entry !== "object" || !entry.request || typeof entry.request !== "object") {
            throw new Error(`invalid request in entry #${i}`);
          }
          const { request: { method, url, headers: headerArray, postData } } = entry;
          const headers = {};
          if (!Array.isArray(headerArray)) {
            throw new Error(`invalid headers array in entry #${i}`);
          }
          let j = 0;
          for (const header of headerArray) {
            j++;
            if (!header || typeof header !== "object" || typeof header.name !== "string" || typeof header.value !== "string") {
              throw new Error(`invalid name or value in header #${j} of entry #${i}`);
            }
            const { name, value } = header;
            headers[name] = value;
          }
          const { path: path2, hash, host, protocol } = parse2(url);
          const origin = `${protocol}//${host}`;
          let requests = requestsPerOrigin.get(origin);
          if (!requests) {
            requests = [];
            requestsPerOrigin.set(origin, requests);
          }
          const request = {
            origin,
            method,
            // only keep path & hash as our HttpClient will handle origin
            path: `${path2}${hash || ""}`,
            headers
          };
          if (typeof postData === "object" && typeof postData.text === "string") {
            request.body = postData.text;
          }
          requests.push(request);
        }
      } catch (err) {
        throw new Error(`Could not parse HAR content: ${err.message}`);
      }
      return requestsPerOrigin;
    }
    exports2.parseHAR = parseHAR2;
  }
});

// node_modules/semver/internal/constants.js
var require_constants2 = __commonJS({
  "node_modules/semver/internal/constants.js"(exports2, module2) {
    "use strict";
    var SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var RELEASE_TYPES = [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ];
    module2.exports = {
      MAX_LENGTH,
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_SAFE_INTEGER,
      RELEASE_TYPES,
      SEMVER_SPEC_VERSION,
      FLAG_INCLUDE_PRERELEASE: 1,
      FLAG_LOOSE: 2
    };
  }
});

// node_modules/semver/internal/debug.js
var require_debug2 = __commonJS({
  "node_modules/semver/internal/debug.js"(exports2, module2) {
    "use strict";
    var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
    };
    module2.exports = debug;
  }
});

// node_modules/semver/internal/re.js
var require_re = __commonJS({
  "node_modules/semver/internal/re.js"(exports2, module2) {
    "use strict";
    var {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = require_constants2();
    var debug = require_debug2();
    exports2 = module2.exports = {};
    var re = exports2.re = [];
    var safeRe = exports2.safeRe = [];
    var src = exports2.src = [];
    var safeSrc = exports2.safeSrc = [];
    var t = exports2.t = {};
    var R = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    var makeSafeRegex = (value) => {
      for (const [token, max2] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max2}}`).split(`${token}+`).join(`${token}{1,${max2}}`);
      }
      return value;
    };
    var createToken = (name, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index = R++;
      debug(name, index, value);
      t[name] = index;
      src[index] = value;
      safeSrc[index] = safe;
      re[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
    createToken("FULL", `^${src[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
    createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src[t.COERCE], true);
    createToken("COERCERTLFULL", src[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
    exports2.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
    exports2.caretTrimReplace = "$1^";
    createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
    exports2.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  }
});

// node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
  "node_modules/semver/internal/parse-options.js"(exports2, module2) {
    "use strict";
    var looseOption = Object.freeze({ loose: true });
    var emptyOpts = Object.freeze({});
    var parseOptions = (options) => {
      if (!options) {
        return emptyOpts;
      }
      if (typeof options !== "object") {
        return looseOption;
      }
      return options;
    };
    module2.exports = parseOptions;
  }
});

// node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
  "node_modules/semver/internal/identifiers.js"(exports2, module2) {
    "use strict";
    var numeric = /^[0-9]+$/;
    var compareIdentifiers = (a, b) => {
      if (typeof a === "number" && typeof b === "number") {
        return a === b ? 0 : a < b ? -1 : 1;
      }
      const anum = numeric.test(a);
      const bnum = numeric.test(b);
      if (anum && bnum) {
        a = +a;
        b = +b;
      }
      return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
    };
    var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
    module2.exports = {
      compareIdentifiers,
      rcompareIdentifiers
    };
  }
});

// node_modules/semver/classes/semver.js
var require_semver = __commonJS({
  "node_modules/semver/classes/semver.js"(exports2, module2) {
    "use strict";
    var debug = require_debug2();
    var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants2();
    var { safeRe: re, t } = require_re();
    var parseOptions = require_parse_options();
    var { compareIdentifiers } = require_identifiers();
    var isPrereleaseIdentifier = (prerelease, identifier) => {
      const identifiers = identifier.split(".");
      if (identifiers.length > prerelease.length) {
        return false;
      }
      for (let i = 0; i < identifiers.length; i++) {
        if (compareIdentifiers(prerelease[i], identifiers[i]) !== 0) {
          return false;
        }
      }
      return true;
    };
    var SemVer = class _SemVer {
      constructor(version2, options) {
        options = parseOptions(options);
        if (version2 instanceof _SemVer) {
          if (version2.loose === !!options.loose && version2.includePrerelease === !!options.includePrerelease) {
            return version2;
          } else {
            version2 = version2.version;
          }
        } else if (typeof version2 !== "string") {
          throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version2}".`);
        }
        if (version2.length > MAX_LENGTH) {
          throw new TypeError(
            `version is longer than ${MAX_LENGTH} characters`
          );
        }
        debug("SemVer", version2, options);
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        const m = version2.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
        if (!m) {
          throw new TypeError(`Invalid Version: ${version2}`);
        }
        this.raw = version2;
        this.major = +m[1];
        this.minor = +m[2];
        this.patch = +m[3];
        if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
          throw new TypeError("Invalid major version");
        }
        if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
          throw new TypeError("Invalid minor version");
        }
        if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
          throw new TypeError("Invalid patch version");
        }
        if (!m[4]) {
          this.prerelease = [];
        } else {
          this.prerelease = m[4].split(".").map((id) => {
            if (/^[0-9]+$/.test(id)) {
              const num = +id;
              if (num >= 0 && num < MAX_SAFE_INTEGER) {
                return num;
              }
            }
            return id;
          });
        }
        this.build = m[5] ? m[5].split(".") : [];
        this.format();
      }
      format() {
        this.version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease.length) {
          this.version += `-${this.prerelease.join(".")}`;
        }
        return this.version;
      }
      toString() {
        return this.version;
      }
      compare(other) {
        debug("SemVer.compare", this.version, this.options, other);
        if (!(other instanceof _SemVer)) {
          if (typeof other === "string" && other === this.version) {
            return 0;
          }
          other = new _SemVer(other, this.options);
        }
        if (other.version === this.version) {
          return 0;
        }
        return this.compareMain(other) || this.comparePre(other);
      }
      compareMain(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.major < other.major) {
          return -1;
        }
        if (this.major > other.major) {
          return 1;
        }
        if (this.minor < other.minor) {
          return -1;
        }
        if (this.minor > other.minor) {
          return 1;
        }
        if (this.patch < other.patch) {
          return -1;
        }
        if (this.patch > other.patch) {
          return 1;
        }
        return 0;
      }
      comparePre(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.prerelease.length && !other.prerelease.length) {
          return -1;
        } else if (!this.prerelease.length && other.prerelease.length) {
          return 1;
        } else if (!this.prerelease.length && !other.prerelease.length) {
          return 0;
        }
        let i = 0;
        do {
          const a = this.prerelease[i];
          const b = other.prerelease[i];
          debug("prerelease compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      compareBuild(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        let i = 0;
        do {
          const a = this.build[i];
          const b = other.build[i];
          debug("build compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      // preminor will bump the version up to the next minor release, and immediately
      // down to pre-release. premajor and prepatch work the same way.
      inc(release, identifier, identifierBase) {
        if (release.startsWith("pre")) {
          if (!identifier && identifierBase === false) {
            throw new Error("invalid increment argument: identifier is empty");
          }
          if (identifier) {
            const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
            if (!match || match[1] !== identifier) {
              throw new Error(`invalid identifier: ${identifier}`);
            }
          }
        }
        switch (release) {
          case "premajor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor = 0;
            this.major++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "preminor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "prepatch":
            this.prerelease.length = 0;
            this.inc("patch", identifier, identifierBase);
            this.inc("pre", identifier, identifierBase);
            break;
          // If the input is a non-prerelease version, this acts the same as
          // prepatch.
          case "prerelease":
            if (this.prerelease.length === 0) {
              this.inc("patch", identifier, identifierBase);
            }
            this.inc("pre", identifier, identifierBase);
            break;
          case "release":
            if (this.prerelease.length === 0) {
              throw new Error(`version ${this.raw} is not a prerelease`);
            }
            this.prerelease.length = 0;
            break;
          case "major":
            if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
              this.major++;
            }
            this.minor = 0;
            this.patch = 0;
            this.prerelease = [];
            break;
          case "minor":
            if (this.patch !== 0 || this.prerelease.length === 0) {
              this.minor++;
            }
            this.patch = 0;
            this.prerelease = [];
            break;
          case "patch":
            if (this.prerelease.length === 0) {
              this.patch++;
            }
            this.prerelease = [];
            break;
          // This probably shouldn't be used publicly.
          // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
          case "pre": {
            const base = Number(identifierBase) ? 1 : 0;
            if (this.prerelease.length === 0) {
              this.prerelease = [base];
            } else {
              let i = this.prerelease.length;
              while (--i >= 0) {
                if (typeof this.prerelease[i] === "number") {
                  this.prerelease[i]++;
                  i = -2;
                }
              }
              if (i === -1) {
                if (identifier === this.prerelease.join(".") && identifierBase === false) {
                  throw new Error("invalid increment argument: identifier already exists");
                }
                this.prerelease.push(base);
              }
            }
            if (identifier) {
              let prerelease = [identifier, base];
              if (identifierBase === false) {
                prerelease = [identifier];
              }
              if (isPrereleaseIdentifier(this.prerelease, identifier)) {
                const prereleaseBase = this.prerelease[identifier.split(".").length];
                if (isNaN(prereleaseBase)) {
                  this.prerelease = prerelease;
                }
              } else {
                this.prerelease = prerelease;
              }
            }
            break;
          }
          default:
            throw new Error(`invalid increment argument: ${release}`);
        }
        this.raw = this.format();
        if (this.build.length) {
          this.raw += `+${this.build.join(".")}`;
        }
        return this;
      }
    };
    module2.exports = SemVer;
  }
});

// node_modules/semver/functions/parse.js
var require_parse = __commonJS({
  "node_modules/semver/functions/parse.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var parse2 = (version2, options, throwErrors = false) => {
      if (version2 instanceof SemVer) {
        return version2;
      }
      try {
        return new SemVer(version2, options);
      } catch (er) {
        if (!throwErrors) {
          return null;
        }
        throw er;
      }
    };
    module2.exports = parse2;
  }
});

// node_modules/semver/functions/valid.js
var require_valid = __commonJS({
  "node_modules/semver/functions/valid.js"(exports2, module2) {
    "use strict";
    var parse2 = require_parse();
    var valid = (version2, options) => {
      const v = parse2(version2, options);
      return v ? v.version : null;
    };
    module2.exports = valid;
  }
});

// node_modules/semver/functions/clean.js
var require_clean = __commonJS({
  "node_modules/semver/functions/clean.js"(exports2, module2) {
    "use strict";
    var parse2 = require_parse();
    var clean = (version2, options) => {
      const s = parse2(version2.trim().replace(/^[=v]+/, ""), options);
      return s ? s.version : null;
    };
    module2.exports = clean;
  }
});

// node_modules/semver/functions/inc.js
var require_inc = __commonJS({
  "node_modules/semver/functions/inc.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var inc = (version2, release, options, identifier, identifierBase) => {
      if (typeof options === "string") {
        identifierBase = identifier;
        identifier = options;
        options = void 0;
      }
      try {
        return new SemVer(
          version2 instanceof SemVer ? version2.version : version2,
          options
        ).inc(release, identifier, identifierBase).version;
      } catch (er) {
        return null;
      }
    };
    module2.exports = inc;
  }
});

// node_modules/semver/functions/diff.js
var require_diff = __commonJS({
  "node_modules/semver/functions/diff.js"(exports2, module2) {
    "use strict";
    var parse2 = require_parse();
    var diff = (version1, version2) => {
      const v12 = parse2(version1, null, true);
      const v2 = parse2(version2, null, true);
      const comparison = v12.compare(v2);
      if (comparison === 0) {
        return null;
      }
      const v1Higher = comparison > 0;
      const highVersion = v1Higher ? v12 : v2;
      const lowVersion = v1Higher ? v2 : v12;
      const highHasPre = !!highVersion.prerelease.length;
      const lowHasPre = !!lowVersion.prerelease.length;
      if (lowHasPre && !highHasPre) {
        if (!lowVersion.patch && !lowVersion.minor) {
          return "major";
        }
        if (lowVersion.compareMain(highVersion) === 0) {
          if (lowVersion.minor && !lowVersion.patch) {
            return "minor";
          }
          return "patch";
        }
      }
      const prefix = highHasPre ? "pre" : "";
      if (v12.major !== v2.major) {
        return prefix + "major";
      }
      if (v12.minor !== v2.minor) {
        return prefix + "minor";
      }
      if (v12.patch !== v2.patch) {
        return prefix + "patch";
      }
      return "prerelease";
    };
    module2.exports = diff;
  }
});

// node_modules/semver/functions/major.js
var require_major = __commonJS({
  "node_modules/semver/functions/major.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var major = (a, loose) => new SemVer(a, loose).major;
    module2.exports = major;
  }
});

// node_modules/semver/functions/minor.js
var require_minor = __commonJS({
  "node_modules/semver/functions/minor.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var minor = (a, loose) => new SemVer(a, loose).minor;
    module2.exports = minor;
  }
});

// node_modules/semver/functions/patch.js
var require_patch = __commonJS({
  "node_modules/semver/functions/patch.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var patch = (a, loose) => new SemVer(a, loose).patch;
    module2.exports = patch;
  }
});

// node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS({
  "node_modules/semver/functions/prerelease.js"(exports2, module2) {
    "use strict";
    var parse2 = require_parse();
    var prerelease = (version2, options) => {
      const parsed = parse2(version2, options);
      return parsed && parsed.prerelease.length ? parsed.prerelease : null;
    };
    module2.exports = prerelease;
  }
});

// node_modules/semver/functions/compare.js
var require_compare = __commonJS({
  "node_modules/semver/functions/compare.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
    module2.exports = compare;
  }
});

// node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS({
  "node_modules/semver/functions/rcompare.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var rcompare = (a, b, loose) => compare(b, a, loose);
    module2.exports = rcompare;
  }
});

// node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS({
  "node_modules/semver/functions/compare-loose.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var compareLoose = (a, b) => compare(a, b, true);
    module2.exports = compareLoose;
  }
});

// node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS({
  "node_modules/semver/functions/compare-build.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var compareBuild = (a, b, loose) => {
      const versionA = new SemVer(a, loose);
      const versionB = new SemVer(b, loose);
      return versionA.compare(versionB) || versionA.compareBuild(versionB);
    };
    module2.exports = compareBuild;
  }
});

// node_modules/semver/functions/sort.js
var require_sort = __commonJS({
  "node_modules/semver/functions/sort.js"(exports2, module2) {
    "use strict";
    var compareBuild = require_compare_build();
    var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
    module2.exports = sort;
  }
});

// node_modules/semver/functions/rsort.js
var require_rsort = __commonJS({
  "node_modules/semver/functions/rsort.js"(exports2, module2) {
    "use strict";
    var compareBuild = require_compare_build();
    var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
    module2.exports = rsort;
  }
});

// node_modules/semver/functions/gt.js
var require_gt = __commonJS({
  "node_modules/semver/functions/gt.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var gt = (a, b, loose) => compare(a, b, loose) > 0;
    module2.exports = gt;
  }
});

// node_modules/semver/functions/lt.js
var require_lt = __commonJS({
  "node_modules/semver/functions/lt.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var lt = (a, b, loose) => compare(a, b, loose) < 0;
    module2.exports = lt;
  }
});

// node_modules/semver/functions/eq.js
var require_eq = __commonJS({
  "node_modules/semver/functions/eq.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var eq = (a, b, loose) => compare(a, b, loose) === 0;
    module2.exports = eq;
  }
});

// node_modules/semver/functions/neq.js
var require_neq = __commonJS({
  "node_modules/semver/functions/neq.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var neq = (a, b, loose) => compare(a, b, loose) !== 0;
    module2.exports = neq;
  }
});

// node_modules/semver/functions/gte.js
var require_gte = __commonJS({
  "node_modules/semver/functions/gte.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var gte = (a, b, loose) => compare(a, b, loose) >= 0;
    module2.exports = gte;
  }
});

// node_modules/semver/functions/lte.js
var require_lte = __commonJS({
  "node_modules/semver/functions/lte.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var lte = (a, b, loose) => compare(a, b, loose) <= 0;
    module2.exports = lte;
  }
});

// node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
  "node_modules/semver/functions/cmp.js"(exports2, module2) {
    "use strict";
    var eq = require_eq();
    var neq = require_neq();
    var gt = require_gt();
    var gte = require_gte();
    var lt = require_lt();
    var lte = require_lte();
    var cmp = (a, op, b, loose) => {
      switch (op) {
        case "===":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a === b;
        case "!==":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a !== b;
        case "":
        case "=":
        case "==":
          return eq(a, b, loose);
        case "!=":
          return neq(a, b, loose);
        case ">":
          return gt(a, b, loose);
        case ">=":
          return gte(a, b, loose);
        case "<":
          return lt(a, b, loose);
        case "<=":
          return lte(a, b, loose);
        default:
          throw new TypeError(`Invalid operator: ${op}`);
      }
    };
    module2.exports = cmp;
  }
});

// node_modules/semver/functions/coerce.js
var require_coerce = __commonJS({
  "node_modules/semver/functions/coerce.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var parse2 = require_parse();
    var { safeRe: re, t } = require_re();
    var coerce = (version2, options) => {
      if (version2 instanceof SemVer) {
        return version2;
      }
      if (typeof version2 === "number") {
        version2 = String(version2);
      }
      if (typeof version2 !== "string") {
        return null;
      }
      options = options || {};
      let match = null;
      if (!options.rtl) {
        match = version2.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
      } else {
        const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
        let next;
        while ((next = coerceRtlRegex.exec(version2)) && (!match || match.index + match[0].length !== version2.length)) {
          if (!match || next.index + next[0].length !== match.index + match[0].length) {
            match = next;
          }
          coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
        }
        coerceRtlRegex.lastIndex = -1;
      }
      if (match === null) {
        return null;
      }
      const major = match[2];
      const minor = match[3] || "0";
      const patch = match[4] || "0";
      const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
      const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
      return parse2(`${major}.${minor}.${patch}${prerelease}${build}`, options);
    };
    module2.exports = coerce;
  }
});

// node_modules/semver/functions/truncate.js
var require_truncate = __commonJS({
  "node_modules/semver/functions/truncate.js"(exports2, module2) {
    "use strict";
    var parse2 = require_parse();
    var constants = require_constants2();
    var SemVer = require_semver();
    var truncate = (version2, truncation, options) => {
      if (!constants.RELEASE_TYPES.includes(truncation)) {
        return null;
      }
      const clonedVersion = cloneInputVersion(version2, options);
      return clonedVersion && doTruncation(clonedVersion, truncation);
    };
    var cloneInputVersion = (version2, options) => {
      const versionStringToParse = version2 instanceof SemVer ? version2.version : version2;
      return parse2(versionStringToParse, options);
    };
    var doTruncation = (version2, truncation) => {
      if (isPrerelease(truncation)) {
        return version2.version;
      }
      version2.prerelease = [];
      switch (truncation) {
        case "major":
          version2.minor = 0;
          version2.patch = 0;
          break;
        case "minor":
          version2.patch = 0;
          break;
      }
      return version2.format();
    };
    var isPrerelease = (type) => {
      return type.startsWith("pre");
    };
    module2.exports = truncate;
  }
});

// node_modules/semver/internal/lrucache.js
var require_lrucache = __commonJS({
  "node_modules/semver/internal/lrucache.js"(exports2, module2) {
    "use strict";
    var LRUCache = class {
      constructor() {
        this.max = 1e3;
        this.map = /* @__PURE__ */ new Map();
      }
      get(key) {
        const value = this.map.get(key);
        if (value === void 0) {
          return void 0;
        } else {
          this.map.delete(key);
          this.map.set(key, value);
          return value;
        }
      }
      delete(key) {
        return this.map.delete(key);
      }
      set(key, value) {
        const deleted = this.delete(key);
        if (!deleted && value !== void 0) {
          if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value;
            this.delete(firstKey);
          }
          this.map.set(key, value);
        }
        return this;
      }
    };
    module2.exports = LRUCache;
  }
});

// node_modules/semver/classes/range.js
var require_range2 = __commonJS({
  "node_modules/semver/classes/range.js"(exports2, module2) {
    "use strict";
    var SPACE_CHARACTERS = /\s+/g;
    var Range = class _Range {
      constructor(range, options) {
        options = parseOptions(options);
        if (range instanceof _Range) {
          if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
            return range;
          } else {
            return new _Range(range.raw, options);
          }
        }
        if (range instanceof Comparator) {
          this.raw = range.value;
          this.set = [[range]];
          this.formatted = void 0;
          return this;
        }
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
        this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
        if (!this.set.length) {
          throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
        }
        if (this.set.length > 1) {
          const first = this.set[0];
          this.set = this.set.filter((c) => !isNullSet(c[0]));
          if (this.set.length === 0) {
            this.set = [first];
          } else if (this.set.length > 1) {
            for (const c of this.set) {
              if (c.length === 1 && isAny(c[0])) {
                this.set = [c];
                break;
              }
            }
          }
        }
        this.formatted = void 0;
      }
      get range() {
        if (this.formatted === void 0) {
          this.formatted = "";
          for (let i = 0; i < this.set.length; i++) {
            if (i > 0) {
              this.formatted += "||";
            }
            const comps = this.set[i];
            for (let k = 0; k < comps.length; k++) {
              if (k > 0) {
                this.formatted += " ";
              }
              this.formatted += comps[k].toString().trim();
            }
          }
        }
        return this.formatted;
      }
      format() {
        return this.range;
      }
      toString() {
        return this.range;
      }
      parseRange(range) {
        range = range.replace(BUILDSTRIPRE, "");
        const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
        const memoKey = memoOpts + ":" + range;
        const cached = cache.get(memoKey);
        if (cached) {
          return cached;
        }
        const loose = this.options.loose;
        const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
        range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
        debug("hyphen replace", range);
        range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
        debug("comparator trim", range);
        range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
        debug("tilde trim", range);
        range = range.replace(re[t.CARETTRIM], caretTrimReplace);
        debug("caret trim", range);
        let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
        if (loose) {
          rangeList = rangeList.filter((comp) => {
            debug("loose invalid filter", comp, this.options);
            return !!comp.match(re[t.COMPARATORLOOSE]);
          });
        }
        debug("range list", rangeList);
        const rangeMap = /* @__PURE__ */ new Map();
        const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
        for (const comp of comparators) {
          if (isNullSet(comp)) {
            return [comp];
          }
          rangeMap.set(comp.value, comp);
        }
        if (rangeMap.size > 1 && rangeMap.has("")) {
          rangeMap.delete("");
        }
        const result = [...rangeMap.values()];
        cache.set(memoKey, result);
        return result;
      }
      intersects(range, options) {
        if (!(range instanceof _Range)) {
          throw new TypeError("a Range is required");
        }
        return this.set.some((thisComparators) => {
          return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
            return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options);
              });
            });
          });
        });
      }
      // if ANY of the sets match ALL of its comparators, then pass
      test(version2) {
        if (!version2) {
          return false;
        }
        if (typeof version2 === "string") {
          try {
            version2 = new SemVer(version2, this.options);
          } catch (er) {
            return false;
          }
        }
        for (let i = 0; i < this.set.length; i++) {
          if (testSet(this.set[i], version2, this.options)) {
            return true;
          }
        }
        return false;
      }
    };
    module2.exports = Range;
    var LRU = require_lrucache();
    var cache = new LRU();
    var parseOptions = require_parse_options();
    var Comparator = require_comparator();
    var debug = require_debug2();
    var SemVer = require_semver();
    var {
      safeRe: re,
      src,
      t,
      comparatorTrimReplace,
      tildeTrimReplace,
      caretTrimReplace
    } = require_re();
    var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants2();
    var BUILDSTRIPRE = new RegExp(src[t.BUILD], "g");
    var isNullSet = (c) => c.value === "<0.0.0-0";
    var isAny = (c) => c.value === "";
    var isSatisfiable = (comparators, options) => {
      let result = true;
      const remainingComparators = comparators.slice();
      let testComparator = remainingComparators.pop();
      while (result && remainingComparators.length) {
        result = remainingComparators.every((otherComparator) => {
          return testComparator.intersects(otherComparator, options);
        });
        testComparator = remainingComparators.pop();
      }
      return result;
    };
    var parseComparator = (comp, options) => {
      comp = comp.replace(re[t.BUILD], "");
      debug("comp", comp, options);
      comp = replaceCarets(comp, options);
      debug("caret", comp);
      comp = replaceTildes(comp, options);
      debug("tildes", comp);
      comp = replaceXRanges(comp, options);
      debug("xrange", comp);
      comp = replaceStars(comp, options);
      debug("stars", comp);
      return comp;
    };
    var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
    var invalidXRangeOrder = (M, m, p) => isX(M) && !isX(m) || isX(m) && p && !isX(p);
    var replaceTildes = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
    };
    var replaceTilde = (comp, options) => {
      const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("tilde", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
        } else if (pr) {
          debug("replaceTilde pr", pr);
          ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
        }
        debug("tilde return", ret);
        return ret;
      });
    };
    var replaceCarets = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
    };
    var replaceCaret = (comp, options) => {
      debug("caret", comp, options);
      const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("caret", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          if (M === "0") {
            ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
          }
        } else if (pr) {
          debug("replaceCaret pr", pr);
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
          }
        } else {
          debug("no pr");
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
          }
        }
        debug("caret return", ret);
        return ret;
      });
    };
    var replaceXRanges = (comp, options) => {
      debug("replaceXRanges", comp, options);
      return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
    };
    var replaceXRange = (comp, options) => {
      comp = comp.trim();
      const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
      return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
        debug("xRange", comp, ret, gtlt, M, m, p, pr);
        if (invalidXRangeOrder(M, m, p)) {
          return comp;
        }
        const xM = isX(M);
        const xm = xM || isX(m);
        const xp = xm || isX(p);
        const anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        pr = options.includePrerelease ? "-0" : "";
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0-0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m = 0;
          }
          p = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M = +M + 1;
              m = 0;
              p = 0;
            } else {
              m = +m + 1;
              p = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M = +M + 1;
            } else {
              m = +m + 1;
            }
          }
          if (gtlt === "<") {
            pr = "-0";
          }
          ret = `${gtlt + M}.${m}.${p}${pr}`;
        } else if (xm) {
          ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
        } else if (xp) {
          ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
        }
        debug("xRange return", ret);
        return ret;
      });
    };
    var replaceStars = (comp, options) => {
      debug("replaceStars", comp, options);
      return comp.trim().replace(re[t.STAR], "");
    };
    var replaceGTE0 = (comp, options) => {
      debug("replaceGTE0", comp, options);
      return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
    };
    var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
      } else if (isX(fp)) {
        from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
      } else if (fpr) {
        from = `>=${from}`;
      } else {
        from = `>=${from}${incPr ? "-0" : ""}`;
      }
      if (isX(tM)) {
        to = "";
      } else if (isX(tm)) {
        to = `<${+tM + 1}.0.0-0`;
      } else if (isX(tp)) {
        to = `<${tM}.${+tm + 1}.0-0`;
      } else if (tpr) {
        to = `<=${tM}.${tm}.${tp}-${tpr}`;
      } else if (incPr) {
        to = `<${tM}.${tm}.${+tp + 1}-0`;
      } else {
        to = `<=${to}`;
      }
      return `${from} ${to}`.trim();
    };
    var testSet = (set, version2, options) => {
      for (let i = 0; i < set.length; i++) {
        if (!set[i].test(version2)) {
          return false;
        }
      }
      if (version2.prerelease.length && !options.includePrerelease) {
        for (let i = 0; i < set.length; i++) {
          debug(set[i].semver);
          if (set[i].semver === Comparator.ANY) {
            continue;
          }
          if (set[i].semver.prerelease.length > 0) {
            const allowed = set[i].semver;
            if (allowed.major === version2.major && allowed.minor === version2.minor && allowed.patch === version2.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    };
  }
});

// node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
  "node_modules/semver/classes/comparator.js"(exports2, module2) {
    "use strict";
    var ANY = /* @__PURE__ */ Symbol("SemVer ANY");
    var Comparator = class _Comparator {
      static get ANY() {
        return ANY;
      }
      constructor(comp, options) {
        options = parseOptions(options);
        if (comp instanceof _Comparator) {
          if (comp.loose === !!options.loose) {
            return comp;
          } else {
            comp = comp.value;
          }
        }
        comp = comp.trim().split(/\s+/).join(" ");
        debug("comparator", comp, options);
        this.options = options;
        this.loose = !!options.loose;
        this.parse(comp);
        if (this.semver === ANY) {
          this.value = "";
        } else {
          this.value = this.operator + this.semver.version;
        }
        debug("comp", this);
      }
      parse(comp) {
        const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
        const m = comp.match(r);
        if (!m) {
          throw new TypeError(`Invalid comparator: ${comp}`);
        }
        this.operator = m[1] !== void 0 ? m[1] : "";
        if (this.operator === "=") {
          this.operator = "";
        }
        if (!m[2]) {
          this.semver = ANY;
        } else {
          this.semver = new SemVer(m[2], this.options.loose);
        }
      }
      toString() {
        return this.value;
      }
      test(version2) {
        debug("Comparator.test", version2, this.options.loose);
        if (this.semver === ANY || version2 === ANY) {
          return true;
        }
        if (typeof version2 === "string") {
          try {
            version2 = new SemVer(version2, this.options);
          } catch (er) {
            return false;
          }
        }
        return cmp(version2, this.operator, this.semver, this.options);
      }
      intersects(comp, options) {
        if (!(comp instanceof _Comparator)) {
          throw new TypeError("a Comparator is required");
        }
        if (this.operator === "") {
          if (this.value === "") {
            return true;
          }
          return new Range(comp.value, options).test(this.value);
        } else if (comp.operator === "") {
          if (comp.value === "") {
            return true;
          }
          return new Range(this.value, options).test(comp.semver);
        }
        options = parseOptions(options);
        if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
          return false;
        }
        if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
          return false;
        }
        if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
          return true;
        }
        if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
          return true;
        }
        if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
          return true;
        }
        if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
          return true;
        }
        if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
          return true;
        }
        return false;
      }
    };
    module2.exports = Comparator;
    var parseOptions = require_parse_options();
    var { safeRe: re, t } = require_re();
    var cmp = require_cmp();
    var debug = require_debug2();
    var SemVer = require_semver();
    var Range = require_range2();
  }
});

// node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
  "node_modules/semver/functions/satisfies.js"(exports2, module2) {
    "use strict";
    var Range = require_range2();
    var satisfies = (version2, range, options) => {
      try {
        range = new Range(range, options);
      } catch (er) {
        return false;
      }
      return range.test(version2);
    };
    module2.exports = satisfies;
  }
});

// node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS({
  "node_modules/semver/ranges/to-comparators.js"(exports2, module2) {
    "use strict";
    var Range = require_range2();
    var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
    module2.exports = toComparators;
  }
});

// node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS({
  "node_modules/semver/ranges/max-satisfying.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range2();
    var maxSatisfying = (versions, range, options) => {
      let max2 = null;
      let maxSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!max2 || maxSV.compare(v) === -1) {
            max2 = v;
            maxSV = new SemVer(max2, options);
          }
        }
      });
      return max2;
    };
    module2.exports = maxSatisfying;
  }
});

// node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS({
  "node_modules/semver/ranges/min-satisfying.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range2();
    var minSatisfying = (versions, range, options) => {
      let min = null;
      let minSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!min || minSV.compare(v) === 1) {
            min = v;
            minSV = new SemVer(min, options);
          }
        }
      });
      return min;
    };
    module2.exports = minSatisfying;
  }
});

// node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS({
  "node_modules/semver/ranges/min-version.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range2();
    var gt = require_gt();
    var minVersion = (range, loose) => {
      range = new Range(range, loose);
      let minver = new SemVer("0.0.0");
      if (range.test(minver)) {
        return minver;
      }
      minver = new SemVer("0.0.0-0");
      if (range.test(minver)) {
        return minver;
      }
      minver = null;
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let setMin = null;
        comparators.forEach((comparator) => {
          const compver = new SemVer(comparator.semver.version);
          switch (comparator.operator) {
            case ">":
              if (compver.prerelease.length === 0) {
                compver.patch++;
              } else {
                compver.prerelease.push(0);
              }
              compver.raw = compver.format();
            /* fallthrough */
            case "":
            case ">=":
              if (!setMin || gt(compver, setMin)) {
                setMin = compver;
              }
              break;
            case "<":
            case "<=":
              break;
            /* istanbul ignore next */
            default:
              throw new Error(`Unexpected operation: ${comparator.operator}`);
          }
        });
        if (setMin && (!minver || gt(minver, setMin))) {
          minver = setMin;
        }
      }
      if (minver && range.test(minver)) {
        return minver;
      }
      return null;
    };
    module2.exports = minVersion;
  }
});

// node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS({
  "node_modules/semver/ranges/valid.js"(exports2, module2) {
    "use strict";
    var Range = require_range2();
    var validRange = (range, options) => {
      try {
        return new Range(range, options).range || "*";
      } catch (er) {
        return null;
      }
    };
    module2.exports = validRange;
  }
});

// node_modules/semver/ranges/outside.js
var require_outside = __commonJS({
  "node_modules/semver/ranges/outside.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var Range = require_range2();
    var satisfies = require_satisfies();
    var gt = require_gt();
    var lt = require_lt();
    var lte = require_lte();
    var gte = require_gte();
    var outside = (version2, range, hilo, options) => {
      version2 = new SemVer(version2, options);
      range = new Range(range, options);
      let gtfn, ltefn, ltfn, comp, ecomp;
      switch (hilo) {
        case ">":
          gtfn = gt;
          ltefn = lte;
          ltfn = lt;
          comp = ">";
          ecomp = ">=";
          break;
        case "<":
          gtfn = lt;
          ltefn = gte;
          ltfn = gt;
          comp = "<";
          ecomp = "<=";
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (satisfies(version2, range, options)) {
        return false;
      }
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let high = null;
        let low = null;
        comparators.forEach((comparator) => {
          if (comparator.semver === ANY) {
            comparator = new Comparator(">=0.0.0");
          }
          high = high || comparator;
          low = low || comparator;
          if (gtfn(comparator.semver, high.semver, options)) {
            high = comparator;
          } else if (ltfn(comparator.semver, low.semver, options)) {
            low = comparator;
          }
        });
        if (high.operator === comp || high.operator === ecomp) {
          return false;
        }
        if ((!low.operator || low.operator === comp) && ltefn(version2, low.semver)) {
          return false;
        } else if (low.operator === ecomp && ltfn(version2, low.semver)) {
          return false;
        }
      }
      return true;
    };
    module2.exports = outside;
  }
});

// node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS({
  "node_modules/semver/ranges/gtr.js"(exports2, module2) {
    "use strict";
    var outside = require_outside();
    var gtr = (version2, range, options) => outside(version2, range, ">", options);
    module2.exports = gtr;
  }
});

// node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS({
  "node_modules/semver/ranges/ltr.js"(exports2, module2) {
    "use strict";
    var outside = require_outside();
    var ltr = (version2, range, options) => outside(version2, range, "<", options);
    module2.exports = ltr;
  }
});

// node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS({
  "node_modules/semver/ranges/intersects.js"(exports2, module2) {
    "use strict";
    var Range = require_range2();
    var intersects = (r1, r2, options) => {
      r1 = new Range(r1, options);
      r2 = new Range(r2, options);
      return r1.intersects(r2, options);
    };
    module2.exports = intersects;
  }
});

// node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS({
  "node_modules/semver/ranges/simplify.js"(exports2, module2) {
    "use strict";
    var satisfies = require_satisfies();
    var compare = require_compare();
    module2.exports = (versions, range, options) => {
      const set = [];
      let first = null;
      let prev = null;
      const v = versions.sort((a, b) => compare(a, b, options));
      for (const version2 of v) {
        const included = satisfies(version2, range, options);
        if (included) {
          prev = version2;
          if (!first) {
            first = version2;
          }
        } else {
          if (prev) {
            set.push([first, prev]);
          }
          prev = null;
          first = null;
        }
      }
      if (first) {
        set.push([first, null]);
      }
      const ranges = [];
      for (const [min, max2] of set) {
        if (min === max2) {
          ranges.push(min);
        } else if (!max2 && min === v[0]) {
          ranges.push("*");
        } else if (!max2) {
          ranges.push(`>=${min}`);
        } else if (min === v[0]) {
          ranges.push(`<=${max2}`);
        } else {
          ranges.push(`${min} - ${max2}`);
        }
      }
      const simplified = ranges.join(" || ");
      const original = typeof range.raw === "string" ? range.raw : String(range);
      return simplified.length < original.length ? simplified : range;
    };
  }
});

// node_modules/semver/ranges/subset.js
var require_subset = __commonJS({
  "node_modules/semver/ranges/subset.js"(exports2, module2) {
    "use strict";
    var Range = require_range2();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var satisfies = require_satisfies();
    var compare = require_compare();
    var subset = (sub, dom, options = {}) => {
      if (sub === dom) {
        return true;
      }
      sub = new Range(sub, options);
      dom = new Range(dom, options);
      let sawNonNull = false;
      OUTER: for (const simpleSub of sub.set) {
        for (const simpleDom of dom.set) {
          const isSub = simpleSubset(simpleSub, simpleDom, options);
          sawNonNull = sawNonNull || isSub !== null;
          if (isSub) {
            continue OUTER;
          }
        }
        if (sawNonNull) {
          return false;
        }
      }
      return true;
    };
    var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
    var minimumVersion = [new Comparator(">=0.0.0")];
    var simpleSubset = (sub, dom, options) => {
      if (sub === dom) {
        return true;
      }
      if (sub.length === 1 && sub[0].semver === ANY) {
        if (dom.length === 1 && dom[0].semver === ANY) {
          return true;
        } else if (options.includePrerelease) {
          sub = minimumVersionWithPreRelease;
        } else {
          sub = minimumVersion;
        }
      }
      if (dom.length === 1 && dom[0].semver === ANY) {
        if (options.includePrerelease) {
          return true;
        } else {
          dom = minimumVersion;
        }
      }
      const eqSet = /* @__PURE__ */ new Set();
      let gt, lt;
      for (const c of sub) {
        if (c.operator === ">" || c.operator === ">=") {
          gt = higherGT(gt, c, options);
        } else if (c.operator === "<" || c.operator === "<=") {
          lt = lowerLT(lt, c, options);
        } else {
          eqSet.add(c.semver);
        }
      }
      if (eqSet.size > 1) {
        return null;
      }
      let gtltComp;
      if (gt && lt) {
        gtltComp = compare(gt.semver, lt.semver, options);
        if (gtltComp > 0) {
          return null;
        } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
          return null;
        }
      }
      for (const eq of eqSet) {
        if (gt && !satisfies(eq, String(gt), options)) {
          return null;
        }
        if (lt && !satisfies(eq, String(lt), options)) {
          return null;
        }
        for (const c of dom) {
          if (!satisfies(eq, String(c), options)) {
            return false;
          }
        }
        return true;
      }
      let higher, lower;
      let hasDomLT, hasDomGT;
      let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
      let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
      if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
        needDomLTPre = false;
      }
      for (const c of dom) {
        hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
        hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
        if (gt) {
          if (needDomGTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
              needDomGTPre = false;
            }
          }
          if (c.operator === ">" || c.operator === ">=") {
            higher = higherGT(gt, c, options);
            if (higher === c && higher !== gt) {
              return false;
            }
          } else if (gt.operator === ">=" && !c.test(gt.semver)) {
            return false;
          }
        }
        if (lt) {
          if (needDomLTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
              needDomLTPre = false;
            }
          }
          if (c.operator === "<" || c.operator === "<=") {
            lower = lowerLT(lt, c, options);
            if (lower === c && lower !== lt) {
              return false;
            }
          } else if (lt.operator === "<=" && !c.test(lt.semver)) {
            return false;
          }
        }
        if (!c.operator && (lt || gt) && gtltComp !== 0) {
          return false;
        }
      }
      if (gt && hasDomLT && !lt && gtltComp !== 0) {
        return false;
      }
      if (lt && hasDomGT && !gt && gtltComp !== 0) {
        return false;
      }
      if (needDomGTPre || needDomLTPre) {
        return false;
      }
      return true;
    };
    var higherGT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
    };
    var lowerLT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
    };
    module2.exports = subset;
  }
});

// node_modules/semver/index.js
var require_semver2 = __commonJS({
  "node_modules/semver/index.js"(exports2, module2) {
    "use strict";
    var internalRe = require_re();
    var constants = require_constants2();
    var SemVer = require_semver();
    var identifiers = require_identifiers();
    var parse2 = require_parse();
    var valid = require_valid();
    var clean = require_clean();
    var inc = require_inc();
    var diff = require_diff();
    var major = require_major();
    var minor = require_minor();
    var patch = require_patch();
    var prerelease = require_prerelease();
    var compare = require_compare();
    var rcompare = require_rcompare();
    var compareLoose = require_compare_loose();
    var compareBuild = require_compare_build();
    var sort = require_sort();
    var rsort = require_rsort();
    var gt = require_gt();
    var lt = require_lt();
    var eq = require_eq();
    var neq = require_neq();
    var gte = require_gte();
    var lte = require_lte();
    var cmp = require_cmp();
    var coerce = require_coerce();
    var truncate = require_truncate();
    var Comparator = require_comparator();
    var Range = require_range2();
    var satisfies = require_satisfies();
    var toComparators = require_to_comparators();
    var maxSatisfying = require_max_satisfying();
    var minSatisfying = require_min_satisfying();
    var minVersion = require_min_version();
    var validRange = require_valid2();
    var outside = require_outside();
    var gtr = require_gtr();
    var ltr = require_ltr();
    var intersects = require_intersects();
    var simplifyRange = require_simplify();
    var subset = require_subset();
    module2.exports = {
      parse: parse2,
      valid,
      clean,
      inc,
      diff,
      major,
      minor,
      patch,
      prerelease,
      compare,
      rcompare,
      compareLoose,
      compareBuild,
      sort,
      rsort,
      gt,
      lt,
      eq,
      neq,
      gte,
      lte,
      cmp,
      coerce,
      truncate,
      Comparator,
      Range,
      satisfies,
      toComparators,
      maxSatisfying,
      minSatisfying,
      minVersion,
      validRange,
      outside,
      gtr,
      ltr,
      intersects,
      simplifyRange,
      subset,
      SemVer,
      re: internalRe.re,
      src: internalRe.src,
      tokens: internalRe.t,
      SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
      RELEASE_TYPES: constants.RELEASE_TYPES,
      compareIdentifiers: identifiers.compareIdentifiers,
      rcompareIdentifiers: identifiers.rcompareIdentifiers
    };
  }
});

// node_modules/autocannon/lib/util.js
var require_util2 = __commonJS({
  "node_modules/autocannon/lib/util.js"(exports2, module2) {
    "use strict";
    var semver = require_semver2();
    var hasWorkerSupport = semver.gte(process.versions.node, "11.7.0");
    function getPropertyCaseInsensitive(obj, key) {
      for (const objKey of Object.keys(obj)) {
        if (objKey.toLowerCase() === key.toLowerCase()) return obj[objKey];
      }
    }
    module2.exports = { hasWorkerSupport, getPropertyCaseInsensitive };
  }
});

// node_modules/autocannon/lib/validate.js
var require_validate = __commonJS({
  "node_modules/autocannon/lib/validate.js"(exports2, module2) {
    "use strict";
    var defaultOptions = require_defaultOptions();
    var timestring = require_timestring();
    var { checkURL: checkURL2 } = require_url();
    var multipart = require_multipart();
    var { parseHAR: parseHAR2 } = require_parseHAR();
    var { hasWorkerSupport } = require_util2();
    var isValidFn = (opt) => !opt || typeof opt === "function" || typeof opt === "string";
    var lessThanOneError = (label) => new Error(`${label} can not be less than 1`);
    var greaterThanZeroError = (label) => new Error(`${label} must be greater than 0`);
    var minIfPresent = (val, min) => val !== null && val < min;
    function safeRequire(path2) {
      if (typeof path2 === "string") {
        try {
          return require(path2);
        } catch (err) {
        }
      }
      return path2;
    }
    function defaultOpts(opts) {
      const setupClient = opts.workers ? opts.setupClient : safeRequire(opts.setupClient);
      const verifyBody = opts.workers ? opts.verifyBody : safeRequire(opts.verifyBody);
      const requests = opts.requests ? opts.requests.map((r) => {
        const setupRequest = opts.workers ? r.setupRequest : safeRequire(r.setupRequest);
        const onResponse = opts.workers ? r.onResponse : safeRequire(r.onResponse);
        return {
          ...r,
          ...setupRequest ? { setupRequest } : void 0,
          ...onResponse ? { onResponse } : void 0
        };
      }) : void 0;
      return {
        ...defaultOptions,
        ...opts,
        ...setupClient ? { setupClient } : void 0,
        ...verifyBody ? { verifyBody } : void 0,
        ...requests ? { requests } : void 0
      };
    }
    module2.exports = function validateOpts2(opts, cbPassedIn) {
      if (opts.workers && !hasWorkerSupport) return new Error("Please use node >= 11.7.0 for workers support");
      if (minIfPresent(opts.bailout, 1)) return lessThanOneError("bailout threshold");
      if (minIfPresent(opts.connectionRate, 1)) return lessThanOneError("connectionRate");
      if (minIfPresent(opts.overallRate, 1)) return lessThanOneError("bailout overallRate");
      if (minIfPresent(opts.amount, 1)) return lessThanOneError("amount");
      if (minIfPresent(opts.maxConnectionRequests, 1)) return lessThanOneError("maxConnectionRequests");
      if (minIfPresent(opts.maxOverallRequests, 1)) return lessThanOneError("maxOverallRequests");
      if (opts.form) {
        opts.method = opts.method || "POST";
      }
      opts = defaultOpts(opts);
      if (opts.requests) {
        if (opts.requests.some((r) => !isValidFn(r.setupRequest))) {
          return new Error("Invalid option setupRequest, please provide a function (or file path when in workers mode)");
        }
        if (opts.requests.some((r) => !isValidFn(r.onResponse))) {
          return new Error("Invalid option onResponse, please provide a function (or file path when in workers mode)");
        }
      }
      if (!isValidFn(opts.setupClient)) {
        return new Error("Invalid option setupClient, please provide a function (or file path when in workers mode)");
      }
      if (!isValidFn(opts.verifyBody)) {
        return new Error("Invalid option verifyBody, please provide a function (or file path when in workers mode)");
      }
      if (!checkURL2(opts.url) && !opts.socketPath) {
        return new Error("url or socketPath option required");
      }
      if (typeof opts.duration === "string") {
        if (/[a-zA-Z]/.exec(opts.duration)) {
          try {
            opts.duration = timestring(opts.duration);
          } catch (error) {
            return error;
          }
        } else {
          opts.duration = Number(opts.duration.trim());
        }
      }
      if (typeof opts.duration !== "number") {
        return new Error("duration entered was in an invalid format");
      }
      if (opts.duration < 0) {
        return new Error("duration can not be less than 0");
      }
      opts.sampleInt = parseFloat(opts.sampleInt);
      if (isNaN(opts.sampleInt)) {
        return new Error("sample interval entered was in an invalid format");
      }
      if (opts.sampleInt < 0) {
        return new Error("sample interval can not be less than 0");
      }
      if (opts.expectBody && opts.requests !== defaultOptions.requests) {
        return new Error("expectBody cannot be used in conjunction with requests");
      }
      if (opts.form) {
        try {
          const data = multipart(opts.form);
          opts.form = opts.workers ? opts.form : data;
        } catch (error) {
          return error;
        }
      }
      opts.harRequests = /* @__PURE__ */ new Map();
      if (opts.har) {
        try {
          opts.harRequests = parseHAR2(opts.har);
        } catch (error) {
          return error;
        }
      }
      if (opts.connections < 1) return lessThanOneError("connections");
      if (opts.pipelining < 1) return lessThanOneError("pipelining factor");
      if (opts.timeout < 1) return greaterThanZeroError("timeout");
      if (opts.ignoreCoordinatedOmission && !opts.connectionRate && !opts.overallRate) {
        return new Error("ignoreCoordinatedOmission makes no sense without connectionRate or overallRate");
      }
      if (opts.forever && cbPassedIn) {
        return new Error("should not use the callback parameter when the `forever` option is set to true. Use the `done` event on this event emitter");
      }
      if (opts.forever && opts.workers) {
        return new Error("Using `forever` option isn't currently supported with workers");
      }
      return opts;
    };
  }
});

// node_modules/autocannon/lib/noop.js
var require_noop = __commonJS({
  "node_modules/autocannon/lib/noop.js"(exports2, module2) {
    module2.exports = function noop() {
    };
  }
});

// node_modules/reinterval/index.js
var require_reinterval = __commonJS({
  "node_modules/reinterval/index.js"(exports2, module2) {
    "use strict";
    function ReInterval(callback, interval, args) {
      var self2 = this;
      this._callback = callback;
      this._args = args;
      this._interval = setInterval(callback, interval, this._args);
      this.reschedule = function(interval2) {
        if (!interval2)
          interval2 = self2._interval;
        if (self2._interval)
          clearInterval(self2._interval);
        self2._interval = setInterval(self2._callback, interval2, self2._args);
      };
      this.clear = function() {
        if (self2._interval) {
          clearInterval(self2._interval);
          self2._interval = void 0;
        }
      };
      this.destroy = function() {
        if (self2._interval) {
          clearInterval(self2._interval);
        }
        self2._callback = void 0;
        self2._interval = void 0;
        self2._args = void 0;
      };
    }
    function reInterval() {
      if (typeof arguments[0] !== "function")
        throw new Error("callback needed");
      if (typeof arguments[1] !== "number")
        throw new Error("interval needed");
      var args;
      if (arguments.length > 0) {
        args = new Array(arguments.length - 2);
        for (var i = 0; i < args.length; i++) {
          args[i] = arguments[i + 2];
        }
      }
      return new ReInterval(arguments[0], arguments[1], args);
    }
    module2.exports = reInterval;
  }
});

// node_modules/retimer/time.js
var require_time = __commonJS({
  "node_modules/retimer/time.js"(exports2, module2) {
    "use strict";
    module2.exports = function getTime() {
      const t = process.hrtime();
      return Math.floor(t[0] * 1e3 + t[1] / 1e6);
    };
  }
});

// node_modules/retimer/retimer.js
var require_retimer = __commonJS({
  "node_modules/retimer/retimer.js"(exports2, module2) {
    "use strict";
    var getTime = require_time();
    var Retimer = class {
      constructor(callback, timeout, args) {
        const that = this;
        this._started = getTime();
        this._rescheduled = 0;
        this._scheduled = timeout;
        this._args = args;
        this._triggered = false;
        this._timerWrapper = () => {
          if (that._rescheduled > 0) {
            that._scheduled = that._rescheduled - (getTime() - that._started);
            that._schedule(that._scheduled);
          } else {
            that._triggered = true;
            callback.apply(null, that._args);
          }
        };
        this._timer = setTimeout(this._timerWrapper, timeout);
      }
      reschedule(timeout) {
        if (!timeout) {
          timeout = this._scheduled;
        }
        const now = getTime();
        if (now + timeout - (this._started + this._scheduled) < 0) {
          clearTimeout(this._timer);
          this._schedule(timeout);
        } else if (!this._triggered) {
          this._started = now;
          this._rescheduled = timeout;
        } else {
          this._schedule(timeout);
        }
      }
      _schedule(timeout) {
        this._triggered = false;
        this._started = getTime();
        this._rescheduled = 0;
        this._scheduled = timeout;
        this._timer = setTimeout(this._timerWrapper, timeout);
      }
      clear() {
        clearTimeout(this._timer);
      }
    };
    function retimer() {
      if (typeof arguments[0] !== "function") {
        throw new Error("callback needed");
      }
      if (typeof arguments[1] !== "number") {
        throw new Error("timeout needed");
      }
      let args;
      if (arguments.length > 0) {
        args = new Array(arguments.length - 2);
        for (var i = 0; i < args.length; i++) {
          args[i] = arguments[i + 2];
        }
      }
      return new Retimer(arguments[0], arguments[1], args);
    }
    module2.exports = retimer;
  }
});

// node_modules/http-parser-js/http-parser.js
var require_http_parser = __commonJS({
  "node_modules/http-parser-js/http-parser.js"(exports2) {
    exports2.HTTPParser = HTTPParser;
    function HTTPParser(type) {
      if (type !== void 0 && type !== HTTPParser.REQUEST && type !== HTTPParser.RESPONSE) {
        throw new Error("type must be REQUEST or RESPONSE");
      }
      if (type === void 0) {
      } else {
        this.initialize(type);
      }
      this.maxHeaderSize = HTTPParser.maxHeaderSize;
    }
    HTTPParser.prototype.initialize = function(type, async_resource) {
      if (type !== HTTPParser.REQUEST && type !== HTTPParser.RESPONSE) {
        throw new Error("type must be REQUEST or RESPONSE");
      }
      this.type = type;
      this.state = type + "_LINE";
      this.info = {
        headers: [],
        upgrade: false
      };
      this.trailers = [];
      this.line = "";
      this.isChunked = false;
      this.connection = "";
      this.headerSize = 0;
      this.body_bytes = null;
      this.isUserCall = false;
      this.hadError = false;
    };
    HTTPParser.encoding = "ascii";
    HTTPParser.maxHeaderSize = 80 * 1024;
    HTTPParser.REQUEST = "REQUEST";
    HTTPParser.RESPONSE = "RESPONSE";
    var kOnHeaders = HTTPParser.kOnHeaders = 1;
    var kOnHeadersComplete = HTTPParser.kOnHeadersComplete = 2;
    var kOnBody = HTTPParser.kOnBody = 3;
    var kOnMessageComplete = HTTPParser.kOnMessageComplete = 4;
    HTTPParser.prototype[kOnHeaders] = HTTPParser.prototype[kOnHeadersComplete] = HTTPParser.prototype[kOnBody] = HTTPParser.prototype[kOnMessageComplete] = function() {
    };
    var compatMode0_12 = true;
    Object.defineProperty(HTTPParser, "kOnExecute", {
      get: function() {
        compatMode0_12 = false;
        return 99;
      }
    });
    var methods = exports2.methods = HTTPParser.methods = [
      "DELETE",
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "CONNECT",
      "OPTIONS",
      "TRACE",
      "COPY",
      "LOCK",
      "MKCOL",
      "MOVE",
      "PROPFIND",
      "PROPPATCH",
      "SEARCH",
      "UNLOCK",
      "BIND",
      "REBIND",
      "UNBIND",
      "ACL",
      "REPORT",
      "MKACTIVITY",
      "CHECKOUT",
      "MERGE",
      "M-SEARCH",
      "NOTIFY",
      "SUBSCRIBE",
      "UNSUBSCRIBE",
      "PATCH",
      "PURGE",
      "MKCALENDAR",
      "LINK",
      "UNLINK",
      "SOURCE"
    ];
    var method_connect = methods.indexOf("CONNECT");
    HTTPParser.prototype.reinitialize = HTTPParser;
    HTTPParser.prototype.close = HTTPParser.prototype.pause = HTTPParser.prototype.resume = HTTPParser.prototype.remove = HTTPParser.prototype.free = function() {
    };
    HTTPParser.prototype._compatMode0_11 = false;
    HTTPParser.prototype.getAsyncId = function() {
      return 0;
    };
    var headerState = {
      REQUEST_LINE: true,
      RESPONSE_LINE: true,
      HEADER: true
    };
    HTTPParser.prototype.execute = function(chunk, start2, length) {
      if (!(this instanceof HTTPParser)) {
        throw new TypeError("not a HTTPParser");
      }
      start2 = start2 || 0;
      length = typeof length === "number" ? length : chunk.length;
      this.chunk = chunk;
      this.offset = start2;
      var end = this.end = start2 + length;
      try {
        while (this.offset < end) {
          if (this[this.state]()) {
            break;
          }
        }
      } catch (err) {
        if (this.isUserCall) {
          throw err;
        }
        this.hadError = true;
        return err;
      }
      this.chunk = null;
      length = this.offset - start2;
      if (headerState[this.state]) {
        this.headerSize += length;
        if (this.headerSize > (this.maxHeaderSize || HTTPParser.maxHeaderSize)) {
          return new Error("max header size exceeded");
        }
      }
      return length;
    };
    var stateFinishAllowed = {
      REQUEST_LINE: true,
      RESPONSE_LINE: true,
      BODY_RAW: true
    };
    HTTPParser.prototype.finish = function() {
      if (this.hadError) {
        return;
      }
      if (!stateFinishAllowed[this.state]) {
        return new Error("invalid state for EOF");
      }
      if (this.state === "BODY_RAW") {
        this.userCall()(this[kOnMessageComplete]());
      }
    };
    HTTPParser.prototype.consume = HTTPParser.prototype.unconsume = HTTPParser.prototype.getCurrentBuffer = function() {
    };
    HTTPParser.prototype.userCall = function() {
      this.isUserCall = true;
      var self2 = this;
      return function(ret) {
        self2.isUserCall = false;
        return ret;
      };
    };
    HTTPParser.prototype.nextRequest = function() {
      this.userCall()(this[kOnMessageComplete]());
      this.reinitialize(this.type);
    };
    HTTPParser.prototype.consumeLine = function() {
      var end = this.end, chunk = this.chunk;
      for (var i = this.offset; i < end; i++) {
        if (chunk[i] === 10) {
          var line = this.line + chunk.toString(HTTPParser.encoding, this.offset, i);
          if (line.charAt(line.length - 1) === "\r") {
            line = line.substr(0, line.length - 1);
          }
          this.line = "";
          this.offset = i + 1;
          return line;
        }
      }
      this.line += chunk.toString(HTTPParser.encoding, this.offset, this.end);
      this.offset = this.end;
    };
    var headerExp = /^([^: \t]+):[ \t]*((?:.*[^ \t])|)/;
    var headerContinueExp = /^[ \t]+(.*[^ \t])/;
    HTTPParser.prototype.parseHeader = function(line, headers) {
      if (line.indexOf("\r") !== -1) {
        throw parseErrorCode("HPE_LF_EXPECTED");
      }
      var match = headerExp.exec(line);
      var k = match && match[1];
      if (k) {
        headers.push(k);
        headers.push(match[2]);
      } else {
        var matchContinue = headerContinueExp.exec(line);
        if (matchContinue && headers.length) {
          if (headers[headers.length - 1]) {
            headers[headers.length - 1] += " ";
          }
          headers[headers.length - 1] += matchContinue[1];
        }
      }
    };
    var requestExp = /^([A-Z-]+) ([^ ]+) HTTP\/(\d)\.(\d)$/;
    HTTPParser.prototype.REQUEST_LINE = function() {
      var line = this.consumeLine();
      if (!line) {
        return;
      }
      var match = requestExp.exec(line);
      if (match === null) {
        throw parseErrorCode("HPE_INVALID_CONSTANT");
      }
      this.info.method = this._compatMode0_11 ? match[1] : methods.indexOf(match[1]);
      if (this.info.method === -1) {
        throw new Error("invalid request method");
      }
      this.info.url = match[2];
      this.info.versionMajor = +match[3];
      this.info.versionMinor = +match[4];
      this.body_bytes = 0;
      this.state = "HEADER";
    };
    var responseExp = /^HTTP\/(\d)\.(\d) (\d{3}) ?(.*)$/;
    HTTPParser.prototype.RESPONSE_LINE = function() {
      var line = this.consumeLine();
      if (!line) {
        return;
      }
      var match = responseExp.exec(line);
      if (match === null) {
        throw parseErrorCode("HPE_INVALID_CONSTANT");
      }
      this.info.versionMajor = +match[1];
      this.info.versionMinor = +match[2];
      var statusCode = this.info.statusCode = +match[3];
      this.info.statusMessage = match[4];
      if ((statusCode / 100 | 0) === 1 || statusCode === 204 || statusCode === 304) {
        this.body_bytes = 0;
      }
      this.state = "HEADER";
    };
    HTTPParser.prototype.shouldKeepAlive = function() {
      if (this.info.versionMajor > 0 && this.info.versionMinor > 0) {
        if (this.connection.indexOf("close") !== -1) {
          return false;
        }
      } else if (this.connection.indexOf("keep-alive") === -1) {
        return false;
      }
      if (this.body_bytes !== null || this.isChunked) {
        return true;
      }
      return false;
    };
    HTTPParser.prototype.HEADER = function() {
      var line = this.consumeLine();
      if (line === void 0) {
        return;
      }
      var info = this.info;
      if (line) {
        this.parseHeader(line, info.headers);
      } else {
        var headers = info.headers;
        var hasContentLength = false;
        var currentContentLengthValue;
        var hasUpgradeHeader = false;
        for (var i = 0; i < headers.length; i += 2) {
          switch (headers[i].toLowerCase()) {
            case "transfer-encoding":
              this.isChunked = headers[i + 1].toLowerCase() === "chunked";
              break;
            case "content-length":
              currentContentLengthValue = +headers[i + 1];
              if (hasContentLength) {
                if (currentContentLengthValue !== this.body_bytes) {
                  throw parseErrorCode("HPE_UNEXPECTED_CONTENT_LENGTH");
                }
              } else {
                hasContentLength = true;
                this.body_bytes = currentContentLengthValue;
              }
              break;
            case "connection":
              this.connection += headers[i + 1].toLowerCase();
              break;
            case "upgrade":
              hasUpgradeHeader = true;
              break;
          }
        }
        if (this.isChunked && hasContentLength) {
          hasContentLength = false;
          this.body_bytes = null;
        }
        if (hasUpgradeHeader && this.connection.indexOf("upgrade") != -1) {
          info.upgrade = this.type === HTTPParser.REQUEST || info.statusCode === 101;
        } else {
          info.upgrade = info.method === method_connect;
        }
        if (this.isChunked && info.upgrade) {
          this.isChunked = false;
        }
        info.shouldKeepAlive = this.shouldKeepAlive();
        var skipBody;
        if (compatMode0_12) {
          skipBody = this.userCall()(this[kOnHeadersComplete](info));
        } else {
          skipBody = this.userCall()(this[kOnHeadersComplete](
            info.versionMajor,
            info.versionMinor,
            info.headers,
            info.method,
            info.url,
            info.statusCode,
            info.statusMessage,
            info.upgrade,
            info.shouldKeepAlive
          ));
        }
        if (skipBody === 2) {
          this.nextRequest();
          return true;
        } else if (this.isChunked && !skipBody) {
          this.state = "BODY_CHUNKHEAD";
        } else if (skipBody || this.body_bytes === 0) {
          this.nextRequest();
          return info.upgrade;
        } else if (this.body_bytes === null) {
          this.state = "BODY_RAW";
        } else {
          this.state = "BODY_SIZED";
        }
      }
    };
    HTTPParser.prototype.BODY_CHUNKHEAD = function() {
      var line = this.consumeLine();
      if (line === void 0) {
        return;
      }
      this.body_bytes = parseInt(line, 16);
      if (!this.body_bytes) {
        this.state = "BODY_CHUNKTRAILERS";
      } else {
        this.state = "BODY_CHUNK";
      }
    };
    HTTPParser.prototype.BODY_CHUNK = function() {
      var length = Math.min(this.end - this.offset, this.body_bytes);
      this.userCall()(this[kOnBody](this.chunk.slice(this.offset, this.offset + length), 0, length));
      this.offset += length;
      this.body_bytes -= length;
      if (!this.body_bytes) {
        this.state = "BODY_CHUNKEMPTYLINE";
      }
    };
    HTTPParser.prototype.BODY_CHUNKEMPTYLINE = function() {
      var line = this.consumeLine();
      if (line === void 0) {
        return;
      }
      if (line !== "") {
        throw new Error("Expected empty line");
      }
      this.state = "BODY_CHUNKHEAD";
    };
    HTTPParser.prototype.BODY_CHUNKTRAILERS = function() {
      var line = this.consumeLine();
      if (line === void 0) {
        return;
      }
      if (line) {
        this.parseHeader(line, this.trailers);
      } else {
        if (this.trailers.length) {
          this.userCall()(this[kOnHeaders](this.trailers, ""));
        }
        this.nextRequest();
      }
    };
    HTTPParser.prototype.BODY_RAW = function() {
      this.userCall()(this[kOnBody](this.chunk.slice(this.offset, this.end), 0, this.end - this.offset));
      this.offset = this.end;
    };
    HTTPParser.prototype.BODY_SIZED = function() {
      var length = Math.min(this.end - this.offset, this.body_bytes);
      this.userCall()(this[kOnBody](this.chunk.slice(this.offset, this.offset + length), 0, length));
      this.offset += length;
      this.body_bytes -= length;
      if (!this.body_bytes) {
        this.nextRequest();
      }
    };
    ["Headers", "HeadersComplete", "Body", "MessageComplete"].forEach(function(name) {
      var k = HTTPParser["kOn" + name];
      Object.defineProperty(HTTPParser.prototype, "on" + name, {
        get: function() {
          return this[k];
        },
        set: function(to) {
          this._compatMode0_11 = true;
          method_connect = "CONNECT";
          return this[k] = to;
        }
      });
    });
    function parseErrorCode(code) {
      var err = new Error("Parse Error");
      err.code = code;
      return err;
    }
  }
});

// node_modules/uuid/dist/esm-node/rng.js
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    import_crypto.default.randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}
var import_crypto, rnds8Pool, poolPtr;
var init_rng = __esm({
  "node_modules/uuid/dist/esm-node/rng.js"() {
    import_crypto = __toESM(require("crypto"));
    rnds8Pool = new Uint8Array(256);
    poolPtr = rnds8Pool.length;
  }
});

// node_modules/uuid/dist/esm-node/regex.js
var regex_default;
var init_regex = __esm({
  "node_modules/uuid/dist/esm-node/regex.js"() {
    regex_default = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
  }
});

// node_modules/uuid/dist/esm-node/validate.js
function validate(uuid) {
  return typeof uuid === "string" && regex_default.test(uuid);
}
var validate_default;
var init_validate = __esm({
  "node_modules/uuid/dist/esm-node/validate.js"() {
    init_regex();
    validate_default = validate;
  }
});

// node_modules/uuid/dist/esm-node/stringify.js
function stringify(arr, offset = 0) {
  const uuid = (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
  if (!validate_default(uuid)) {
    throw TypeError("Stringified UUID is invalid");
  }
  return uuid;
}
var byteToHex, stringify_default;
var init_stringify = __esm({
  "node_modules/uuid/dist/esm-node/stringify.js"() {
    init_validate();
    byteToHex = [];
    for (let i = 0; i < 256; ++i) {
      byteToHex.push((i + 256).toString(16).substr(1));
    }
    stringify_default = stringify;
  }
});

// node_modules/uuid/dist/esm-node/v1.js
function v1(options, buf, offset) {
  let i = buf && offset || 0;
  const b = buf || new Array(16);
  options = options || {};
  let node = options.node || _nodeId;
  let clockseq = options.clockseq !== void 0 ? options.clockseq : _clockseq;
  if (node == null || clockseq == null) {
    const seedBytes = options.random || (options.rng || rng)();
    if (node == null) {
      node = _nodeId = [seedBytes[0] | 1, seedBytes[1], seedBytes[2], seedBytes[3], seedBytes[4], seedBytes[5]];
    }
    if (clockseq == null) {
      clockseq = _clockseq = (seedBytes[6] << 8 | seedBytes[7]) & 16383;
    }
  }
  let msecs = options.msecs !== void 0 ? options.msecs : Date.now();
  let nsecs = options.nsecs !== void 0 ? options.nsecs : _lastNSecs + 1;
  const dt = msecs - _lastMSecs + (nsecs - _lastNSecs) / 1e4;
  if (dt < 0 && options.clockseq === void 0) {
    clockseq = clockseq + 1 & 16383;
  }
  if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === void 0) {
    nsecs = 0;
  }
  if (nsecs >= 1e4) {
    throw new Error("uuid.v1(): Can't create more than 10M uuids/sec");
  }
  _lastMSecs = msecs;
  _lastNSecs = nsecs;
  _clockseq = clockseq;
  msecs += 122192928e5;
  const tl = ((msecs & 268435455) * 1e4 + nsecs) % 4294967296;
  b[i++] = tl >>> 24 & 255;
  b[i++] = tl >>> 16 & 255;
  b[i++] = tl >>> 8 & 255;
  b[i++] = tl & 255;
  const tmh = msecs / 4294967296 * 1e4 & 268435455;
  b[i++] = tmh >>> 8 & 255;
  b[i++] = tmh & 255;
  b[i++] = tmh >>> 24 & 15 | 16;
  b[i++] = tmh >>> 16 & 255;
  b[i++] = clockseq >>> 8 | 128;
  b[i++] = clockseq & 255;
  for (let n = 0; n < 6; ++n) {
    b[i + n] = node[n];
  }
  return buf || stringify_default(b);
}
var _nodeId, _clockseq, _lastMSecs, _lastNSecs, v1_default;
var init_v1 = __esm({
  "node_modules/uuid/dist/esm-node/v1.js"() {
    init_rng();
    init_stringify();
    _lastMSecs = 0;
    _lastNSecs = 0;
    v1_default = v1;
  }
});

// node_modules/uuid/dist/esm-node/parse.js
function parse(uuid) {
  if (!validate_default(uuid)) {
    throw TypeError("Invalid UUID");
  }
  let v;
  const arr = new Uint8Array(16);
  arr[0] = (v = parseInt(uuid.slice(0, 8), 16)) >>> 24;
  arr[1] = v >>> 16 & 255;
  arr[2] = v >>> 8 & 255;
  arr[3] = v & 255;
  arr[4] = (v = parseInt(uuid.slice(9, 13), 16)) >>> 8;
  arr[5] = v & 255;
  arr[6] = (v = parseInt(uuid.slice(14, 18), 16)) >>> 8;
  arr[7] = v & 255;
  arr[8] = (v = parseInt(uuid.slice(19, 23), 16)) >>> 8;
  arr[9] = v & 255;
  arr[10] = (v = parseInt(uuid.slice(24, 36), 16)) / 1099511627776 & 255;
  arr[11] = v / 4294967296 & 255;
  arr[12] = v >>> 24 & 255;
  arr[13] = v >>> 16 & 255;
  arr[14] = v >>> 8 & 255;
  arr[15] = v & 255;
  return arr;
}
var parse_default;
var init_parse = __esm({
  "node_modules/uuid/dist/esm-node/parse.js"() {
    init_validate();
    parse_default = parse;
  }
});

// node_modules/uuid/dist/esm-node/v35.js
function stringToBytes(str) {
  str = unescape(encodeURIComponent(str));
  const bytes = [];
  for (let i = 0; i < str.length; ++i) {
    bytes.push(str.charCodeAt(i));
  }
  return bytes;
}
function v35_default(name, version2, hashfunc) {
  function generateUUID(value, namespace, buf, offset) {
    if (typeof value === "string") {
      value = stringToBytes(value);
    }
    if (typeof namespace === "string") {
      namespace = parse_default(namespace);
    }
    if (namespace.length !== 16) {
      throw TypeError("Namespace must be array-like (16 iterable integer values, 0-255)");
    }
    let bytes = new Uint8Array(16 + value.length);
    bytes.set(namespace);
    bytes.set(value, namespace.length);
    bytes = hashfunc(bytes);
    bytes[6] = bytes[6] & 15 | version2;
    bytes[8] = bytes[8] & 63 | 128;
    if (buf) {
      offset = offset || 0;
      for (let i = 0; i < 16; ++i) {
        buf[offset + i] = bytes[i];
      }
      return buf;
    }
    return stringify_default(bytes);
  }
  try {
    generateUUID.name = name;
  } catch (err) {
  }
  generateUUID.DNS = DNS;
  generateUUID.URL = URL;
  return generateUUID;
}
var DNS, URL;
var init_v35 = __esm({
  "node_modules/uuid/dist/esm-node/v35.js"() {
    init_stringify();
    init_parse();
    DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
  }
});

// node_modules/uuid/dist/esm-node/md5.js
function md5(bytes) {
  if (Array.isArray(bytes)) {
    bytes = Buffer.from(bytes);
  } else if (typeof bytes === "string") {
    bytes = Buffer.from(bytes, "utf8");
  }
  return import_crypto2.default.createHash("md5").update(bytes).digest();
}
var import_crypto2, md5_default;
var init_md5 = __esm({
  "node_modules/uuid/dist/esm-node/md5.js"() {
    import_crypto2 = __toESM(require("crypto"));
    md5_default = md5;
  }
});

// node_modules/uuid/dist/esm-node/v3.js
var v3, v3_default;
var init_v3 = __esm({
  "node_modules/uuid/dist/esm-node/v3.js"() {
    init_v35();
    init_md5();
    v3 = v35_default("v3", 48, md5_default);
    v3_default = v3;
  }
});

// node_modules/uuid/dist/esm-node/v4.js
function v4(options, buf, offset) {
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return stringify_default(rnds);
}
var v4_default;
var init_v4 = __esm({
  "node_modules/uuid/dist/esm-node/v4.js"() {
    init_rng();
    init_stringify();
    v4_default = v4;
  }
});

// node_modules/uuid/dist/esm-node/sha1.js
function sha1(bytes) {
  if (Array.isArray(bytes)) {
    bytes = Buffer.from(bytes);
  } else if (typeof bytes === "string") {
    bytes = Buffer.from(bytes, "utf8");
  }
  return import_crypto3.default.createHash("sha1").update(bytes).digest();
}
var import_crypto3, sha1_default;
var init_sha1 = __esm({
  "node_modules/uuid/dist/esm-node/sha1.js"() {
    import_crypto3 = __toESM(require("crypto"));
    sha1_default = sha1;
  }
});

// node_modules/uuid/dist/esm-node/v5.js
var v5, v5_default;
var init_v5 = __esm({
  "node_modules/uuid/dist/esm-node/v5.js"() {
    init_v35();
    init_sha1();
    v5 = v35_default("v5", 80, sha1_default);
    v5_default = v5;
  }
});

// node_modules/uuid/dist/esm-node/nil.js
var nil_default;
var init_nil = __esm({
  "node_modules/uuid/dist/esm-node/nil.js"() {
    nil_default = "00000000-0000-0000-0000-000000000000";
  }
});

// node_modules/uuid/dist/esm-node/version.js
function version(uuid) {
  if (!validate_default(uuid)) {
    throw TypeError("Invalid UUID");
  }
  return parseInt(uuid.substr(14, 1), 16);
}
var version_default;
var init_version = __esm({
  "node_modules/uuid/dist/esm-node/version.js"() {
    init_validate();
    version_default = version;
  }
});

// node_modules/uuid/dist/esm-node/index.js
var esm_node_exports = {};
__export(esm_node_exports, {
  NIL: () => nil_default,
  parse: () => parse_default,
  stringify: () => stringify_default,
  v1: () => v1_default,
  v3: () => v3_default,
  v4: () => v4_default,
  v5: () => v5_default,
  validate: () => validate_default,
  version: () => version_default
});
var init_esm_node = __esm({
  "node_modules/uuid/dist/esm-node/index.js"() {
    init_v1();
    init_v3();
    init_v4();
    init_v5();
    init_nil();
    init_version();
    init_validate();
    init_stringify();
    init_parse();
  }
});

// node_modules/hyperid/uuid-node.js
var require_uuid_node = __commonJS({
  "node_modules/hyperid/uuid-node.js"(exports2, module2) {
    "use strict";
    var uuid = (init_esm_node(), __toCommonJS(esm_node_exports));
    var crypto4 = require("crypto");
    module2.exports = typeof crypto4.randomUUID === "function" ? crypto4.randomUUID : uuid.v4;
  }
});

// node_modules/uuid-parse/uuid-parse.js
var require_uuid_parse = __commonJS({
  "node_modules/uuid-parse/uuid-parse.js"(exports2, module2) {
    "use strict";
    var _byteToHex = [];
    var _hexToByte = {};
    for (i = 0; i < 256; i++) {
      _byteToHex[i] = (i + 256).toString(16).substr(1);
      _hexToByte[_byteToHex[i]] = i;
    }
    var i;
    function parse2(s, buf, offset) {
      var i2 = buf && offset || 0;
      var ii = 0;
      buf = buf || [];
      s.toLowerCase().replace(/[0-9a-f]{2}/g, function(oct) {
        if (ii < 16) {
          buf[i2 + ii++] = _hexToByte[oct];
        }
      });
      while (ii < 16) {
        buf[i2 + ii++] = 0;
      }
      return buf;
    }
    function unparse(buf, offset) {
      var i2 = offset || 0;
      var bth = _byteToHex;
      return bth[buf[i2++]] + bth[buf[i2++]] + bth[buf[i2++]] + bth[buf[i2++]] + "-" + bth[buf[i2++]] + bth[buf[i2++]] + "-" + bth[buf[i2++]] + bth[buf[i2++]] + "-" + bth[buf[i2++]] + bth[buf[i2++]] + "-" + bth[buf[i2++]] + bth[buf[i2++]] + bth[buf[i2++]] + bth[buf[i2++]] + bth[buf[i2++]] + bth[buf[i2++]];
    }
    module2.exports = {
      parse: parse2,
      unparse
    };
  }
});

// node_modules/ieee754/index.js
var require_ieee754 = __commonJS({
  "node_modules/ieee754/index.js"(exports2) {
    exports2.read = function(buffer, offset, isLE, mLen, nBytes) {
      var e, m;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var nBits = -7;
      var i = isLE ? nBytes - 1 : 0;
      var d = isLE ? -1 : 1;
      var s = buffer[offset + i];
      i += d;
      e = s & (1 << -nBits) - 1;
      s >>= -nBits;
      nBits += eLen;
      for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {
      }
      m = e & (1 << -nBits) - 1;
      e >>= -nBits;
      nBits += mLen;
      for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {
      }
      if (e === 0) {
        e = 1 - eBias;
      } else if (e === eMax) {
        return m ? NaN : (s ? -1 : 1) * Infinity;
      } else {
        m = m + Math.pow(2, mLen);
        e = e - eBias;
      }
      return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
    };
    exports2.write = function(buffer, value, offset, isLE, mLen, nBytes) {
      var e, m, c;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
      var i = isLE ? 0 : nBytes - 1;
      var d = isLE ? 1 : -1;
      var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
      value = Math.abs(value);
      if (isNaN(value) || value === Infinity) {
        m = isNaN(value) ? 1 : 0;
        e = eMax;
      } else {
        e = Math.floor(Math.log(value) / Math.LN2);
        if (value * (c = Math.pow(2, -e)) < 1) {
          e--;
          c *= 2;
        }
        if (e + eBias >= 1) {
          value += rt / c;
        } else {
          value += rt * Math.pow(2, 1 - eBias);
        }
        if (value * c >= 2) {
          e++;
          c /= 2;
        }
        if (e + eBias >= eMax) {
          m = 0;
          e = eMax;
        } else if (e + eBias >= 1) {
          m = (value * c - 1) * Math.pow(2, mLen);
          e = e + eBias;
        } else {
          m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
          e = 0;
        }
      }
      for (; mLen >= 8; buffer[offset + i] = m & 255, i += d, m /= 256, mLen -= 8) {
      }
      e = e << mLen | m;
      eLen += mLen;
      for (; eLen > 0; buffer[offset + i] = e & 255, i += d, e /= 256, eLen -= 8) {
      }
      buffer[offset + i - d] |= s * 128;
    };
  }
});

// node_modules/buffer/index.js
var require_buffer = __commonJS({
  "node_modules/buffer/index.js"(exports2) {
    "use strict";
    var base642 = require_base64_js();
    var ieee754 = require_ieee754();
    var customInspectSymbol = typeof Symbol === "function" && typeof Symbol["for"] === "function" ? Symbol["for"]("nodejs.util.inspect.custom") : null;
    exports2.Buffer = Buffer2;
    exports2.SlowBuffer = SlowBuffer;
    exports2.INSPECT_MAX_BYTES = 50;
    var K_MAX_LENGTH = 2147483647;
    exports2.kMaxLength = K_MAX_LENGTH;
    Buffer2.TYPED_ARRAY_SUPPORT = typedArraySupport();
    if (!Buffer2.TYPED_ARRAY_SUPPORT && typeof console !== "undefined" && typeof console.error === "function") {
      console.error(
        "This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support."
      );
    }
    function typedArraySupport() {
      try {
        var arr = new Uint8Array(1);
        var proto = { foo: function() {
          return 42;
        } };
        Object.setPrototypeOf(proto, Uint8Array.prototype);
        Object.setPrototypeOf(arr, proto);
        return arr.foo() === 42;
      } catch (e) {
        return false;
      }
    }
    Object.defineProperty(Buffer2.prototype, "parent", {
      enumerable: true,
      get: function() {
        if (!Buffer2.isBuffer(this)) return void 0;
        return this.buffer;
      }
    });
    Object.defineProperty(Buffer2.prototype, "offset", {
      enumerable: true,
      get: function() {
        if (!Buffer2.isBuffer(this)) return void 0;
        return this.byteOffset;
      }
    });
    function createBuffer(length) {
      if (length > K_MAX_LENGTH) {
        throw new RangeError('The value "' + length + '" is invalid for option "size"');
      }
      var buf = new Uint8Array(length);
      Object.setPrototypeOf(buf, Buffer2.prototype);
      return buf;
    }
    function Buffer2(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        if (typeof encodingOrOffset === "string") {
          throw new TypeError(
            'The "string" argument must be of type string. Received type number'
          );
        }
        return allocUnsafe(arg);
      }
      return from(arg, encodingOrOffset, length);
    }
    Buffer2.poolSize = 8192;
    function from(value, encodingOrOffset, length) {
      if (typeof value === "string") {
        return fromString(value, encodingOrOffset);
      }
      if (ArrayBuffer.isView(value)) {
        return fromArrayView(value);
      }
      if (value == null) {
        throw new TypeError(
          "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
        );
      }
      if (isInstance(value, ArrayBuffer) || value && isInstance(value.buffer, ArrayBuffer)) {
        return fromArrayBuffer(value, encodingOrOffset, length);
      }
      if (typeof SharedArrayBuffer !== "undefined" && (isInstance(value, SharedArrayBuffer) || value && isInstance(value.buffer, SharedArrayBuffer))) {
        return fromArrayBuffer(value, encodingOrOffset, length);
      }
      if (typeof value === "number") {
        throw new TypeError(
          'The "value" argument must not be of type number. Received type number'
        );
      }
      var valueOf = value.valueOf && value.valueOf();
      if (valueOf != null && valueOf !== value) {
        return Buffer2.from(valueOf, encodingOrOffset, length);
      }
      var b = fromObject(value);
      if (b) return b;
      if (typeof Symbol !== "undefined" && Symbol.toPrimitive != null && typeof value[Symbol.toPrimitive] === "function") {
        return Buffer2.from(
          value[Symbol.toPrimitive]("string"),
          encodingOrOffset,
          length
        );
      }
      throw new TypeError(
        "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
      );
    }
    Buffer2.from = function(value, encodingOrOffset, length) {
      return from(value, encodingOrOffset, length);
    };
    Object.setPrototypeOf(Buffer2.prototype, Uint8Array.prototype);
    Object.setPrototypeOf(Buffer2, Uint8Array);
    function assertSize(size) {
      if (typeof size !== "number") {
        throw new TypeError('"size" argument must be of type number');
      } else if (size < 0) {
        throw new RangeError('The value "' + size + '" is invalid for option "size"');
      }
    }
    function alloc(size, fill, encoding) {
      assertSize(size);
      if (size <= 0) {
        return createBuffer(size);
      }
      if (fill !== void 0) {
        return typeof encoding === "string" ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
      }
      return createBuffer(size);
    }
    Buffer2.alloc = function(size, fill, encoding) {
      return alloc(size, fill, encoding);
    };
    function allocUnsafe(size) {
      assertSize(size);
      return createBuffer(size < 0 ? 0 : checked(size) | 0);
    }
    Buffer2.allocUnsafe = function(size) {
      return allocUnsafe(size);
    };
    Buffer2.allocUnsafeSlow = function(size) {
      return allocUnsafe(size);
    };
    function fromString(string, encoding) {
      if (typeof encoding !== "string" || encoding === "") {
        encoding = "utf8";
      }
      if (!Buffer2.isEncoding(encoding)) {
        throw new TypeError("Unknown encoding: " + encoding);
      }
      var length = byteLength(string, encoding) | 0;
      var buf = createBuffer(length);
      var actual = buf.write(string, encoding);
      if (actual !== length) {
        buf = buf.slice(0, actual);
      }
      return buf;
    }
    function fromArrayLike(array) {
      var length = array.length < 0 ? 0 : checked(array.length) | 0;
      var buf = createBuffer(length);
      for (var i = 0; i < length; i += 1) {
        buf[i] = array[i] & 255;
      }
      return buf;
    }
    function fromArrayView(arrayView) {
      if (isInstance(arrayView, Uint8Array)) {
        var copy = new Uint8Array(arrayView);
        return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength);
      }
      return fromArrayLike(arrayView);
    }
    function fromArrayBuffer(array, byteOffset, length) {
      if (byteOffset < 0 || array.byteLength < byteOffset) {
        throw new RangeError('"offset" is outside of buffer bounds');
      }
      if (array.byteLength < byteOffset + (length || 0)) {
        throw new RangeError('"length" is outside of buffer bounds');
      }
      var buf;
      if (byteOffset === void 0 && length === void 0) {
        buf = new Uint8Array(array);
      } else if (length === void 0) {
        buf = new Uint8Array(array, byteOffset);
      } else {
        buf = new Uint8Array(array, byteOffset, length);
      }
      Object.setPrototypeOf(buf, Buffer2.prototype);
      return buf;
    }
    function fromObject(obj) {
      if (Buffer2.isBuffer(obj)) {
        var len = checked(obj.length) | 0;
        var buf = createBuffer(len);
        if (buf.length === 0) {
          return buf;
        }
        obj.copy(buf, 0, 0, len);
        return buf;
      }
      if (obj.length !== void 0) {
        if (typeof obj.length !== "number" || numberIsNaN(obj.length)) {
          return createBuffer(0);
        }
        return fromArrayLike(obj);
      }
      if (obj.type === "Buffer" && Array.isArray(obj.data)) {
        return fromArrayLike(obj.data);
      }
    }
    function checked(length) {
      if (length >= K_MAX_LENGTH) {
        throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + K_MAX_LENGTH.toString(16) + " bytes");
      }
      return length | 0;
    }
    function SlowBuffer(length) {
      if (+length != length) {
        length = 0;
      }
      return Buffer2.alloc(+length);
    }
    Buffer2.isBuffer = function isBuffer(b) {
      return b != null && b._isBuffer === true && b !== Buffer2.prototype;
    };
    Buffer2.compare = function compare(a, b) {
      if (isInstance(a, Uint8Array)) a = Buffer2.from(a, a.offset, a.byteLength);
      if (isInstance(b, Uint8Array)) b = Buffer2.from(b, b.offset, b.byteLength);
      if (!Buffer2.isBuffer(a) || !Buffer2.isBuffer(b)) {
        throw new TypeError(
          'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
        );
      }
      if (a === b) return 0;
      var x = a.length;
      var y = b.length;
      for (var i = 0, len = Math.min(x, y); i < len; ++i) {
        if (a[i] !== b[i]) {
          x = a[i];
          y = b[i];
          break;
        }
      }
      if (x < y) return -1;
      if (y < x) return 1;
      return 0;
    };
    Buffer2.isEncoding = function isEncoding(encoding) {
      switch (String(encoding).toLowerCase()) {
        case "hex":
        case "utf8":
        case "utf-8":
        case "ascii":
        case "latin1":
        case "binary":
        case "base64":
        case "ucs2":
        case "ucs-2":
        case "utf16le":
        case "utf-16le":
          return true;
        default:
          return false;
      }
    };
    Buffer2.concat = function concat(list, length) {
      if (!Array.isArray(list)) {
        throw new TypeError('"list" argument must be an Array of Buffers');
      }
      if (list.length === 0) {
        return Buffer2.alloc(0);
      }
      var i;
      if (length === void 0) {
        length = 0;
        for (i = 0; i < list.length; ++i) {
          length += list[i].length;
        }
      }
      var buffer = Buffer2.allocUnsafe(length);
      var pos = 0;
      for (i = 0; i < list.length; ++i) {
        var buf = list[i];
        if (isInstance(buf, Uint8Array)) {
          if (pos + buf.length > buffer.length) {
            Buffer2.from(buf).copy(buffer, pos);
          } else {
            Uint8Array.prototype.set.call(
              buffer,
              buf,
              pos
            );
          }
        } else if (!Buffer2.isBuffer(buf)) {
          throw new TypeError('"list" argument must be an Array of Buffers');
        } else {
          buf.copy(buffer, pos);
        }
        pos += buf.length;
      }
      return buffer;
    };
    function byteLength(string, encoding) {
      if (Buffer2.isBuffer(string)) {
        return string.length;
      }
      if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
        return string.byteLength;
      }
      if (typeof string !== "string") {
        throw new TypeError(
          'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' + typeof string
        );
      }
      var len = string.length;
      var mustMatch = arguments.length > 2 && arguments[2] === true;
      if (!mustMatch && len === 0) return 0;
      var loweredCase = false;
      for (; ; ) {
        switch (encoding) {
          case "ascii":
          case "latin1":
          case "binary":
            return len;
          case "utf8":
          case "utf-8":
            return utf8ToBytes(string).length;
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return len * 2;
          case "hex":
            return len >>> 1;
          case "base64":
            return base64ToBytes(string).length;
          default:
            if (loweredCase) {
              return mustMatch ? -1 : utf8ToBytes(string).length;
            }
            encoding = ("" + encoding).toLowerCase();
            loweredCase = true;
        }
      }
    }
    Buffer2.byteLength = byteLength;
    function slowToString(encoding, start2, end) {
      var loweredCase = false;
      if (start2 === void 0 || start2 < 0) {
        start2 = 0;
      }
      if (start2 > this.length) {
        return "";
      }
      if (end === void 0 || end > this.length) {
        end = this.length;
      }
      if (end <= 0) {
        return "";
      }
      end >>>= 0;
      start2 >>>= 0;
      if (end <= start2) {
        return "";
      }
      if (!encoding) encoding = "utf8";
      while (true) {
        switch (encoding) {
          case "hex":
            return hexSlice(this, start2, end);
          case "utf8":
          case "utf-8":
            return utf8Slice(this, start2, end);
          case "ascii":
            return asciiSlice(this, start2, end);
          case "latin1":
          case "binary":
            return latin1Slice(this, start2, end);
          case "base64":
            return base64Slice(this, start2, end);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return utf16leSlice(this, start2, end);
          default:
            if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
            encoding = (encoding + "").toLowerCase();
            loweredCase = true;
        }
      }
    }
    Buffer2.prototype._isBuffer = true;
    function swap(b, n, m) {
      var i = b[n];
      b[n] = b[m];
      b[m] = i;
    }
    Buffer2.prototype.swap16 = function swap16() {
      var len = this.length;
      if (len % 2 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 16-bits");
      }
      for (var i = 0; i < len; i += 2) {
        swap(this, i, i + 1);
      }
      return this;
    };
    Buffer2.prototype.swap32 = function swap32() {
      var len = this.length;
      if (len % 4 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 32-bits");
      }
      for (var i = 0; i < len; i += 4) {
        swap(this, i, i + 3);
        swap(this, i + 1, i + 2);
      }
      return this;
    };
    Buffer2.prototype.swap64 = function swap64() {
      var len = this.length;
      if (len % 8 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 64-bits");
      }
      for (var i = 0; i < len; i += 8) {
        swap(this, i, i + 7);
        swap(this, i + 1, i + 6);
        swap(this, i + 2, i + 5);
        swap(this, i + 3, i + 4);
      }
      return this;
    };
    Buffer2.prototype.toString = function toString() {
      var length = this.length;
      if (length === 0) return "";
      if (arguments.length === 0) return utf8Slice(this, 0, length);
      return slowToString.apply(this, arguments);
    };
    Buffer2.prototype.toLocaleString = Buffer2.prototype.toString;
    Buffer2.prototype.equals = function equals(b) {
      if (!Buffer2.isBuffer(b)) throw new TypeError("Argument must be a Buffer");
      if (this === b) return true;
      return Buffer2.compare(this, b) === 0;
    };
    Buffer2.prototype.inspect = function inspect() {
      var str = "";
      var max2 = exports2.INSPECT_MAX_BYTES;
      str = this.toString("hex", 0, max2).replace(/(.{2})/g, "$1 ").trim();
      if (this.length > max2) str += " ... ";
      return "<Buffer " + str + ">";
    };
    if (customInspectSymbol) {
      Buffer2.prototype[customInspectSymbol] = Buffer2.prototype.inspect;
    }
    Buffer2.prototype.compare = function compare(target, start2, end, thisStart, thisEnd) {
      if (isInstance(target, Uint8Array)) {
        target = Buffer2.from(target, target.offset, target.byteLength);
      }
      if (!Buffer2.isBuffer(target)) {
        throw new TypeError(
          'The "target" argument must be one of type Buffer or Uint8Array. Received type ' + typeof target
        );
      }
      if (start2 === void 0) {
        start2 = 0;
      }
      if (end === void 0) {
        end = target ? target.length : 0;
      }
      if (thisStart === void 0) {
        thisStart = 0;
      }
      if (thisEnd === void 0) {
        thisEnd = this.length;
      }
      if (start2 < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
        throw new RangeError("out of range index");
      }
      if (thisStart >= thisEnd && start2 >= end) {
        return 0;
      }
      if (thisStart >= thisEnd) {
        return -1;
      }
      if (start2 >= end) {
        return 1;
      }
      start2 >>>= 0;
      end >>>= 0;
      thisStart >>>= 0;
      thisEnd >>>= 0;
      if (this === target) return 0;
      var x = thisEnd - thisStart;
      var y = end - start2;
      var len = Math.min(x, y);
      var thisCopy = this.slice(thisStart, thisEnd);
      var targetCopy = target.slice(start2, end);
      for (var i = 0; i < len; ++i) {
        if (thisCopy[i] !== targetCopy[i]) {
          x = thisCopy[i];
          y = targetCopy[i];
          break;
        }
      }
      if (x < y) return -1;
      if (y < x) return 1;
      return 0;
    };
    function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
      if (buffer.length === 0) return -1;
      if (typeof byteOffset === "string") {
        encoding = byteOffset;
        byteOffset = 0;
      } else if (byteOffset > 2147483647) {
        byteOffset = 2147483647;
      } else if (byteOffset < -2147483648) {
        byteOffset = -2147483648;
      }
      byteOffset = +byteOffset;
      if (numberIsNaN(byteOffset)) {
        byteOffset = dir ? 0 : buffer.length - 1;
      }
      if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
      if (byteOffset >= buffer.length) {
        if (dir) return -1;
        else byteOffset = buffer.length - 1;
      } else if (byteOffset < 0) {
        if (dir) byteOffset = 0;
        else return -1;
      }
      if (typeof val === "string") {
        val = Buffer2.from(val, encoding);
      }
      if (Buffer2.isBuffer(val)) {
        if (val.length === 0) {
          return -1;
        }
        return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
      } else if (typeof val === "number") {
        val = val & 255;
        if (typeof Uint8Array.prototype.indexOf === "function") {
          if (dir) {
            return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
          } else {
            return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
          }
        }
        return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
      }
      throw new TypeError("val must be string, number or Buffer");
    }
    function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
      var indexSize = 1;
      var arrLength = arr.length;
      var valLength = val.length;
      if (encoding !== void 0) {
        encoding = String(encoding).toLowerCase();
        if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
          if (arr.length < 2 || val.length < 2) {
            return -1;
          }
          indexSize = 2;
          arrLength /= 2;
          valLength /= 2;
          byteOffset /= 2;
        }
      }
      function read(buf, i2) {
        if (indexSize === 1) {
          return buf[i2];
        } else {
          return buf.readUInt16BE(i2 * indexSize);
        }
      }
      var i;
      if (dir) {
        var foundIndex = -1;
        for (i = byteOffset; i < arrLength; i++) {
          if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
            if (foundIndex === -1) foundIndex = i;
            if (i - foundIndex + 1 === valLength) return foundIndex * indexSize;
          } else {
            if (foundIndex !== -1) i -= i - foundIndex;
            foundIndex = -1;
          }
        }
      } else {
        if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
        for (i = byteOffset; i >= 0; i--) {
          var found = true;
          for (var j = 0; j < valLength; j++) {
            if (read(arr, i + j) !== read(val, j)) {
              found = false;
              break;
            }
          }
          if (found) return i;
        }
      }
      return -1;
    }
    Buffer2.prototype.includes = function includes(val, byteOffset, encoding) {
      return this.indexOf(val, byteOffset, encoding) !== -1;
    };
    Buffer2.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
      return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
    };
    Buffer2.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
      return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
    };
    function hexWrite(buf, string, offset, length) {
      offset = Number(offset) || 0;
      var remaining = buf.length - offset;
      if (!length) {
        length = remaining;
      } else {
        length = Number(length);
        if (length > remaining) {
          length = remaining;
        }
      }
      var strLen = string.length;
      if (length > strLen / 2) {
        length = strLen / 2;
      }
      for (var i = 0; i < length; ++i) {
        var parsed = parseInt(string.substr(i * 2, 2), 16);
        if (numberIsNaN(parsed)) return i;
        buf[offset + i] = parsed;
      }
      return i;
    }
    function utf8Write(buf, string, offset, length) {
      return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length);
    }
    function asciiWrite(buf, string, offset, length) {
      return blitBuffer(asciiToBytes(string), buf, offset, length);
    }
    function base64Write(buf, string, offset, length) {
      return blitBuffer(base64ToBytes(string), buf, offset, length);
    }
    function ucs2Write(buf, string, offset, length) {
      return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
    }
    Buffer2.prototype.write = function write(string, offset, length, encoding) {
      if (offset === void 0) {
        encoding = "utf8";
        length = this.length;
        offset = 0;
      } else if (length === void 0 && typeof offset === "string") {
        encoding = offset;
        length = this.length;
        offset = 0;
      } else if (isFinite(offset)) {
        offset = offset >>> 0;
        if (isFinite(length)) {
          length = length >>> 0;
          if (encoding === void 0) encoding = "utf8";
        } else {
          encoding = length;
          length = void 0;
        }
      } else {
        throw new Error(
          "Buffer.write(string, encoding, offset[, length]) is no longer supported"
        );
      }
      var remaining = this.length - offset;
      if (length === void 0 || length > remaining) length = remaining;
      if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
        throw new RangeError("Attempt to write outside buffer bounds");
      }
      if (!encoding) encoding = "utf8";
      var loweredCase = false;
      for (; ; ) {
        switch (encoding) {
          case "hex":
            return hexWrite(this, string, offset, length);
          case "utf8":
          case "utf-8":
            return utf8Write(this, string, offset, length);
          case "ascii":
          case "latin1":
          case "binary":
            return asciiWrite(this, string, offset, length);
          case "base64":
            return base64Write(this, string, offset, length);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return ucs2Write(this, string, offset, length);
          default:
            if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
            encoding = ("" + encoding).toLowerCase();
            loweredCase = true;
        }
      }
    };
    Buffer2.prototype.toJSON = function toJSON() {
      return {
        type: "Buffer",
        data: Array.prototype.slice.call(this._arr || this, 0)
      };
    };
    function base64Slice(buf, start2, end) {
      if (start2 === 0 && end === buf.length) {
        return base642.fromByteArray(buf);
      } else {
        return base642.fromByteArray(buf.slice(start2, end));
      }
    }
    function utf8Slice(buf, start2, end) {
      end = Math.min(buf.length, end);
      var res = [];
      var i = start2;
      while (i < end) {
        var firstByte = buf[i];
        var codePoint = null;
        var bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
        if (i + bytesPerSequence <= end) {
          var secondByte, thirdByte, fourthByte, tempCodePoint;
          switch (bytesPerSequence) {
            case 1:
              if (firstByte < 128) {
                codePoint = firstByte;
              }
              break;
            case 2:
              secondByte = buf[i + 1];
              if ((secondByte & 192) === 128) {
                tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
                if (tempCodePoint > 127) {
                  codePoint = tempCodePoint;
                }
              }
              break;
            case 3:
              secondByte = buf[i + 1];
              thirdByte = buf[i + 2];
              if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
                tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
                if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
                  codePoint = tempCodePoint;
                }
              }
              break;
            case 4:
              secondByte = buf[i + 1];
              thirdByte = buf[i + 2];
              fourthByte = buf[i + 3];
              if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
                tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
                if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
                  codePoint = tempCodePoint;
                }
              }
          }
        }
        if (codePoint === null) {
          codePoint = 65533;
          bytesPerSequence = 1;
        } else if (codePoint > 65535) {
          codePoint -= 65536;
          res.push(codePoint >>> 10 & 1023 | 55296);
          codePoint = 56320 | codePoint & 1023;
        }
        res.push(codePoint);
        i += bytesPerSequence;
      }
      return decodeCodePointsArray(res);
    }
    var MAX_ARGUMENTS_LENGTH = 4096;
    function decodeCodePointsArray(codePoints) {
      var len = codePoints.length;
      if (len <= MAX_ARGUMENTS_LENGTH) {
        return String.fromCharCode.apply(String, codePoints);
      }
      var res = "";
      var i = 0;
      while (i < len) {
        res += String.fromCharCode.apply(
          String,
          codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
        );
      }
      return res;
    }
    function asciiSlice(buf, start2, end) {
      var ret = "";
      end = Math.min(buf.length, end);
      for (var i = start2; i < end; ++i) {
        ret += String.fromCharCode(buf[i] & 127);
      }
      return ret;
    }
    function latin1Slice(buf, start2, end) {
      var ret = "";
      end = Math.min(buf.length, end);
      for (var i = start2; i < end; ++i) {
        ret += String.fromCharCode(buf[i]);
      }
      return ret;
    }
    function hexSlice(buf, start2, end) {
      var len = buf.length;
      if (!start2 || start2 < 0) start2 = 0;
      if (!end || end < 0 || end > len) end = len;
      var out = "";
      for (var i = start2; i < end; ++i) {
        out += hexSliceLookupTable[buf[i]];
      }
      return out;
    }
    function utf16leSlice(buf, start2, end) {
      var bytes = buf.slice(start2, end);
      var res = "";
      for (var i = 0; i < bytes.length - 1; i += 2) {
        res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
      }
      return res;
    }
    Buffer2.prototype.slice = function slice(start2, end) {
      var len = this.length;
      start2 = ~~start2;
      end = end === void 0 ? len : ~~end;
      if (start2 < 0) {
        start2 += len;
        if (start2 < 0) start2 = 0;
      } else if (start2 > len) {
        start2 = len;
      }
      if (end < 0) {
        end += len;
        if (end < 0) end = 0;
      } else if (end > len) {
        end = len;
      }
      if (end < start2) end = start2;
      var newBuf = this.subarray(start2, end);
      Object.setPrototypeOf(newBuf, Buffer2.prototype);
      return newBuf;
    };
    function checkOffset(offset, ext, length) {
      if (offset % 1 !== 0 || offset < 0) throw new RangeError("offset is not uint");
      if (offset + ext > length) throw new RangeError("Trying to access beyond buffer length");
    }
    Buffer2.prototype.readUintLE = Buffer2.prototype.readUIntLE = function readUIntLE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      var val = this[offset];
      var mul = 1;
      var i = 0;
      while (++i < byteLength2 && (mul *= 256)) {
        val += this[offset + i] * mul;
      }
      return val;
    };
    Buffer2.prototype.readUintBE = Buffer2.prototype.readUIntBE = function readUIntBE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        checkOffset(offset, byteLength2, this.length);
      }
      var val = this[offset + --byteLength2];
      var mul = 1;
      while (byteLength2 > 0 && (mul *= 256)) {
        val += this[offset + --byteLength2] * mul;
      }
      return val;
    };
    Buffer2.prototype.readUint8 = Buffer2.prototype.readUInt8 = function readUInt8(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 1, this.length);
      return this[offset];
    };
    Buffer2.prototype.readUint16LE = Buffer2.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      return this[offset] | this[offset + 1] << 8;
    };
    Buffer2.prototype.readUint16BE = Buffer2.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      return this[offset] << 8 | this[offset + 1];
    };
    Buffer2.prototype.readUint32LE = Buffer2.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216;
    };
    Buffer2.prototype.readUint32BE = Buffer2.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
    };
    Buffer2.prototype.readIntLE = function readIntLE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      var val = this[offset];
      var mul = 1;
      var i = 0;
      while (++i < byteLength2 && (mul *= 256)) {
        val += this[offset + i] * mul;
      }
      mul *= 128;
      if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
      return val;
    };
    Buffer2.prototype.readIntBE = function readIntBE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      var i = byteLength2;
      var mul = 1;
      var val = this[offset + --i];
      while (i > 0 && (mul *= 256)) {
        val += this[offset + --i] * mul;
      }
      mul *= 128;
      if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
      return val;
    };
    Buffer2.prototype.readInt8 = function readInt8(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 1, this.length);
      if (!(this[offset] & 128)) return this[offset];
      return (255 - this[offset] + 1) * -1;
    };
    Buffer2.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      var val = this[offset] | this[offset + 1] << 8;
      return val & 32768 ? val | 4294901760 : val;
    };
    Buffer2.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      var val = this[offset + 1] | this[offset] << 8;
      return val & 32768 ? val | 4294901760 : val;
    };
    Buffer2.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
    };
    Buffer2.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
    };
    Buffer2.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return ieee754.read(this, offset, true, 23, 4);
    };
    Buffer2.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return ieee754.read(this, offset, false, 23, 4);
    };
    Buffer2.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 8, this.length);
      return ieee754.read(this, offset, true, 52, 8);
    };
    Buffer2.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 8, this.length);
      return ieee754.read(this, offset, false, 52, 8);
    };
    function checkInt(buf, value, offset, ext, max2, min) {
      if (!Buffer2.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
      if (value > max2 || value < min) throw new RangeError('"value" argument is out of bounds');
      if (offset + ext > buf.length) throw new RangeError("Index out of range");
    }
    Buffer2.prototype.writeUintLE = Buffer2.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        var maxBytes = Math.pow(2, 8 * byteLength2) - 1;
        checkInt(this, value, offset, byteLength2, maxBytes, 0);
      }
      var mul = 1;
      var i = 0;
      this[offset] = value & 255;
      while (++i < byteLength2 && (mul *= 256)) {
        this[offset + i] = value / mul & 255;
      }
      return offset + byteLength2;
    };
    Buffer2.prototype.writeUintBE = Buffer2.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        var maxBytes = Math.pow(2, 8 * byteLength2) - 1;
        checkInt(this, value, offset, byteLength2, maxBytes, 0);
      }
      var i = byteLength2 - 1;
      var mul = 1;
      this[offset + i] = value & 255;
      while (--i >= 0 && (mul *= 256)) {
        this[offset + i] = value / mul & 255;
      }
      return offset + byteLength2;
    };
    Buffer2.prototype.writeUint8 = Buffer2.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 1, 255, 0);
      this[offset] = value & 255;
      return offset + 1;
    };
    Buffer2.prototype.writeUint16LE = Buffer2.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      return offset + 2;
    };
    Buffer2.prototype.writeUint16BE = Buffer2.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
      this[offset] = value >>> 8;
      this[offset + 1] = value & 255;
      return offset + 2;
    };
    Buffer2.prototype.writeUint32LE = Buffer2.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
      this[offset + 3] = value >>> 24;
      this[offset + 2] = value >>> 16;
      this[offset + 1] = value >>> 8;
      this[offset] = value & 255;
      return offset + 4;
    };
    Buffer2.prototype.writeUint32BE = Buffer2.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
      this[offset] = value >>> 24;
      this[offset + 1] = value >>> 16;
      this[offset + 2] = value >>> 8;
      this[offset + 3] = value & 255;
      return offset + 4;
    };
    Buffer2.prototype.writeIntLE = function writeIntLE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        var limit = Math.pow(2, 8 * byteLength2 - 1);
        checkInt(this, value, offset, byteLength2, limit - 1, -limit);
      }
      var i = 0;
      var mul = 1;
      var sub = 0;
      this[offset] = value & 255;
      while (++i < byteLength2 && (mul *= 256)) {
        if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
          sub = 1;
        }
        this[offset + i] = (value / mul >> 0) - sub & 255;
      }
      return offset + byteLength2;
    };
    Buffer2.prototype.writeIntBE = function writeIntBE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        var limit = Math.pow(2, 8 * byteLength2 - 1);
        checkInt(this, value, offset, byteLength2, limit - 1, -limit);
      }
      var i = byteLength2 - 1;
      var mul = 1;
      var sub = 0;
      this[offset + i] = value & 255;
      while (--i >= 0 && (mul *= 256)) {
        if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
          sub = 1;
        }
        this[offset + i] = (value / mul >> 0) - sub & 255;
      }
      return offset + byteLength2;
    };
    Buffer2.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 1, 127, -128);
      if (value < 0) value = 255 + value + 1;
      this[offset] = value & 255;
      return offset + 1;
    };
    Buffer2.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      return offset + 2;
    };
    Buffer2.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
      this[offset] = value >>> 8;
      this[offset + 1] = value & 255;
      return offset + 2;
    };
    Buffer2.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      this[offset + 2] = value >>> 16;
      this[offset + 3] = value >>> 24;
      return offset + 4;
    };
    Buffer2.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
      if (value < 0) value = 4294967295 + value + 1;
      this[offset] = value >>> 24;
      this[offset + 1] = value >>> 16;
      this[offset + 2] = value >>> 8;
      this[offset + 3] = value & 255;
      return offset + 4;
    };
    function checkIEEE754(buf, value, offset, ext, max2, min) {
      if (offset + ext > buf.length) throw new RangeError("Index out of range");
      if (offset < 0) throw new RangeError("Index out of range");
    }
    function writeFloat(buf, value, offset, littleEndian, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        checkIEEE754(buf, value, offset, 4, 34028234663852886e22, -34028234663852886e22);
      }
      ieee754.write(buf, value, offset, littleEndian, 23, 4);
      return offset + 4;
    }
    Buffer2.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
      return writeFloat(this, value, offset, true, noAssert);
    };
    Buffer2.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
      return writeFloat(this, value, offset, false, noAssert);
    };
    function writeDouble(buf, value, offset, littleEndian, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        checkIEEE754(buf, value, offset, 8, 17976931348623157e292, -17976931348623157e292);
      }
      ieee754.write(buf, value, offset, littleEndian, 52, 8);
      return offset + 8;
    }
    Buffer2.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
      return writeDouble(this, value, offset, true, noAssert);
    };
    Buffer2.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
      return writeDouble(this, value, offset, false, noAssert);
    };
    Buffer2.prototype.copy = function copy(target, targetStart, start2, end) {
      if (!Buffer2.isBuffer(target)) throw new TypeError("argument should be a Buffer");
      if (!start2) start2 = 0;
      if (!end && end !== 0) end = this.length;
      if (targetStart >= target.length) targetStart = target.length;
      if (!targetStart) targetStart = 0;
      if (end > 0 && end < start2) end = start2;
      if (end === start2) return 0;
      if (target.length === 0 || this.length === 0) return 0;
      if (targetStart < 0) {
        throw new RangeError("targetStart out of bounds");
      }
      if (start2 < 0 || start2 >= this.length) throw new RangeError("Index out of range");
      if (end < 0) throw new RangeError("sourceEnd out of bounds");
      if (end > this.length) end = this.length;
      if (target.length - targetStart < end - start2) {
        end = target.length - targetStart + start2;
      }
      var len = end - start2;
      if (this === target && typeof Uint8Array.prototype.copyWithin === "function") {
        this.copyWithin(targetStart, start2, end);
      } else {
        Uint8Array.prototype.set.call(
          target,
          this.subarray(start2, end),
          targetStart
        );
      }
      return len;
    };
    Buffer2.prototype.fill = function fill(val, start2, end, encoding) {
      if (typeof val === "string") {
        if (typeof start2 === "string") {
          encoding = start2;
          start2 = 0;
          end = this.length;
        } else if (typeof end === "string") {
          encoding = end;
          end = this.length;
        }
        if (encoding !== void 0 && typeof encoding !== "string") {
          throw new TypeError("encoding must be a string");
        }
        if (typeof encoding === "string" && !Buffer2.isEncoding(encoding)) {
          throw new TypeError("Unknown encoding: " + encoding);
        }
        if (val.length === 1) {
          var code = val.charCodeAt(0);
          if (encoding === "utf8" && code < 128 || encoding === "latin1") {
            val = code;
          }
        }
      } else if (typeof val === "number") {
        val = val & 255;
      } else if (typeof val === "boolean") {
        val = Number(val);
      }
      if (start2 < 0 || this.length < start2 || this.length < end) {
        throw new RangeError("Out of range index");
      }
      if (end <= start2) {
        return this;
      }
      start2 = start2 >>> 0;
      end = end === void 0 ? this.length : end >>> 0;
      if (!val) val = 0;
      var i;
      if (typeof val === "number") {
        for (i = start2; i < end; ++i) {
          this[i] = val;
        }
      } else {
        var bytes = Buffer2.isBuffer(val) ? val : Buffer2.from(val, encoding);
        var len = bytes.length;
        if (len === 0) {
          throw new TypeError('The value "' + val + '" is invalid for argument "value"');
        }
        for (i = 0; i < end - start2; ++i) {
          this[i + start2] = bytes[i % len];
        }
      }
      return this;
    };
    var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;
    function base64clean(str) {
      str = str.split("=")[0];
      str = str.trim().replace(INVALID_BASE64_RE, "");
      if (str.length < 2) return "";
      while (str.length % 4 !== 0) {
        str = str + "=";
      }
      return str;
    }
    function utf8ToBytes(string, units) {
      units = units || Infinity;
      var codePoint;
      var length = string.length;
      var leadSurrogate = null;
      var bytes = [];
      for (var i = 0; i < length; ++i) {
        codePoint = string.charCodeAt(i);
        if (codePoint > 55295 && codePoint < 57344) {
          if (!leadSurrogate) {
            if (codePoint > 56319) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              continue;
            } else if (i + 1 === length) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              continue;
            }
            leadSurrogate = codePoint;
            continue;
          }
          if (codePoint < 56320) {
            if ((units -= 3) > -1) bytes.push(239, 191, 189);
            leadSurrogate = codePoint;
            continue;
          }
          codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
        } else if (leadSurrogate) {
          if ((units -= 3) > -1) bytes.push(239, 191, 189);
        }
        leadSurrogate = null;
        if (codePoint < 128) {
          if ((units -= 1) < 0) break;
          bytes.push(codePoint);
        } else if (codePoint < 2048) {
          if ((units -= 2) < 0) break;
          bytes.push(
            codePoint >> 6 | 192,
            codePoint & 63 | 128
          );
        } else if (codePoint < 65536) {
          if ((units -= 3) < 0) break;
          bytes.push(
            codePoint >> 12 | 224,
            codePoint >> 6 & 63 | 128,
            codePoint & 63 | 128
          );
        } else if (codePoint < 1114112) {
          if ((units -= 4) < 0) break;
          bytes.push(
            codePoint >> 18 | 240,
            codePoint >> 12 & 63 | 128,
            codePoint >> 6 & 63 | 128,
            codePoint & 63 | 128
          );
        } else {
          throw new Error("Invalid code point");
        }
      }
      return bytes;
    }
    function asciiToBytes(str) {
      var byteArray = [];
      for (var i = 0; i < str.length; ++i) {
        byteArray.push(str.charCodeAt(i) & 255);
      }
      return byteArray;
    }
    function utf16leToBytes(str, units) {
      var c, hi, lo;
      var byteArray = [];
      for (var i = 0; i < str.length; ++i) {
        if ((units -= 2) < 0) break;
        c = str.charCodeAt(i);
        hi = c >> 8;
        lo = c % 256;
        byteArray.push(lo);
        byteArray.push(hi);
      }
      return byteArray;
    }
    function base64ToBytes(str) {
      return base642.toByteArray(base64clean(str));
    }
    function blitBuffer(src, dst, offset, length) {
      for (var i = 0; i < length; ++i) {
        if (i + offset >= dst.length || i >= src.length) break;
        dst[i + offset] = src[i];
      }
      return i;
    }
    function isInstance(obj, type) {
      return obj instanceof type || obj != null && obj.constructor != null && obj.constructor.name != null && obj.constructor.name === type.name;
    }
    function numberIsNaN(obj) {
      return obj !== obj;
    }
    var hexSliceLookupTable = (function() {
      var alphabet = "0123456789abcdef";
      var table = new Array(256);
      for (var i = 0; i < 16; ++i) {
        var i16 = i * 16;
        for (var j = 0; j < 16; ++j) {
          table[i16 + j] = alphabet[i] + alphabet[j];
        }
      }
      return table;
    })();
  }
});

// node_modules/hyperid/hyperid.js
var require_hyperid = __commonJS({
  "node_modules/hyperid/hyperid.js"(exports2, module2) {
    "use strict";
    var uuidv4 = require_uuid_node();
    var parser = require_uuid_parse();
    var Buffer2 = loadBuffer();
    function loadBuffer() {
      const b = require("buffer");
      return b && b.Buffer ? b.Buffer : require_buffer().Buffer;
    }
    var base64Padding = Buffer2.from("==", "base64");
    function hyperid(opts) {
      let fixedLength = false;
      let urlSafe = false;
      let maxInt = Math.pow(2, 31) - 1;
      if (typeof opts === "boolean") {
        fixedLength = opts;
      } else {
        opts = opts || {};
        maxInt = opts.maxInt || Math.pow(2, 31) - 1;
        urlSafe = !!opts.urlSafe;
        fixedLength = !!opts.fixedLength;
      }
      generate.uuid = uuidv4();
      generate.decode = decode;
      let id = baseId(generate.uuid, urlSafe);
      let count = Math.floor(opts.startFrom || 0);
      if (isNaN(maxInt)) throw new Error(`maxInt must be a number. recieved ${opts.maxInt}`);
      if (isNaN(count) || !(maxInt > count && count >= 0)) {
        throw new Error([
          `when passed, opts.startFrom must be a number between 0 and ${maxInt}.`,
          "Only the integer part matters.",
          `- got: ${opts.startFrom}`
        ].join("\n"));
      }
      return generate;
      function generate() {
        let result;
        if (count === maxInt) {
          generate.uuid = uuidv4();
          id = baseId(generate.uuid, urlSafe);
          count = 0;
        }
        if (fixedLength) {
          result = id + `0000000000${count}`.slice(-10);
        } else {
          result = id + count;
        }
        count = count + 1 | 0;
        return result;
      }
    }
    function baseId(id, urlSafe) {
      const base64Id = Buffer2.concat([Buffer2.from(parser.parse(id)), base64Padding]).toString("base64");
      if (urlSafe) {
        return base64Id.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "-");
      }
      return base64Id.replace(/=+$/, "/");
    }
    function decode(id, opts) {
      opts = opts || {};
      const urlSafe = !!opts.urlSafe;
      if (urlSafe) {
        id = id.replace(/-([^-]*)$/, "/$1").replace(/-/g, "+").replace(/_/g, "/");
      }
      if (id.length < 22) {
        return null;
      }
      const lastSlashIndex = id.lastIndexOf("/");
      if (lastSlashIndex === -1) {
        return null;
      }
      const uuidPart = id.substring(0, lastSlashIndex);
      const countPart = Number(id.substring(lastSlashIndex + 1));
      if (!uuidPart || isNaN(countPart)) {
        return null;
      }
      const result = {
        uuid: parser.unparse(Buffer2.from(uuidPart + "==", "base64")),
        count: countPart
      };
      return result;
    }
    module2.exports = hyperid;
    module2.exports.decode = decode;
  }
});

// node_modules/autocannon/lib/httpMethods.js
var require_httpMethods = __commonJS({
  "node_modules/autocannon/lib/httpMethods.js"(exports2, module2) {
    module2.exports = [
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "DELETE",
      "CONNECT",
      "OPTIONS",
      "TRACE",
      "PATCH"
    ];
  }
});

// node_modules/autocannon/lib/httpRequestBuilder.js
var require_httpRequestBuilder = __commonJS({
  "node_modules/autocannon/lib/httpRequestBuilder.js"(exports2, module2) {
    "use strict";
    var methods = require_httpMethods();
    var { getPropertyCaseInsensitive } = require_util2();
    function requestBuilder(defaults2) {
      const builderDefaults = {
        method: "GET",
        path: "/",
        headers: {},
        body: Buffer.alloc(0),
        hostname: "localhost",
        setupRequest: (reqData) => reqData,
        port: 80
      };
      defaults2 = Object.assign(builderDefaults, defaults2);
      return function buildRequest(reqData, context) {
        reqData = reqData || {};
        reqData.headers = Object.assign({}, defaults2.headers, reqData.headers);
        reqData = Object.assign({}, defaults2, reqData);
        reqData = reqData.setupRequest(reqData, context);
        if (!reqData) {
          return null;
        }
        const method = reqData.method;
        const path2 = reqData.path;
        const headers = reqData.headers;
        const body = reqData.body;
        const headersDefinedHost = getPropertyCaseInsensitive(reqData.headers, "host");
        let host = headersDefinedHost || reqData.host;
        if (!host) {
          const hostname = reqData.hostname;
          const port = reqData.port;
          host = hostname + ":" + port;
        }
        const baseReq = [
          `${method} ${path2} HTTP/1.1`
        ];
        if (!headersDefinedHost) {
          baseReq.push(`Host: ${host}`);
        }
        baseReq.push("Connection: keep-alive");
        if (reqData.auth) {
          const encodedAuth = Buffer.from(reqData.auth).toString("base64");
          headers.Authorization = `Basic ${encodedAuth}`;
        }
        if (methods.indexOf(method) < 0) {
          throw new Error(`${method} HTTP method is not supported`);
        }
        let bodyBuf;
        if (typeof body === "string") {
          bodyBuf = Buffer.from(body);
        } else if (typeof body === "number") {
          bodyBuf = Buffer.from(body + "");
        } else if (Buffer.isBuffer(body)) {
          bodyBuf = body;
        } else if (body && Array.isArray(body._)) {
          bodyBuf = Buffer.from(`[${body._}]`);
        } else if (body) {
          throw new Error("body must be either a string or a buffer");
        }
        if (bodyBuf && bodyBuf.length > 0) {
          const idCount = reqData.idReplacement ? (bodyBuf.toString().match(/\[<id>\]/g) || []).length : 0;
          headers["Content-Length"] = `${bodyBuf.length + idCount * 27}`;
        }
        for (const [key, header] of Object.entries(headers)) {
          baseReq.push(`${key}: ${header}`);
        }
        let req = Buffer.from(baseReq.join("\r\n") + "\r\n\r\n", "utf8");
        if (bodyBuf && bodyBuf.length > 0) {
          req = Buffer.concat([req, bodyBuf]);
        }
        return req;
      };
    }
    module2.exports = requestBuilder;
  }
});

// node_modules/lodash.clonedeep/index.js
var require_lodash = __commonJS({
  "node_modules/lodash.clonedeep/index.js"(exports2, module2) {
    var LARGE_ARRAY_SIZE = 200;
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    var MAX_SAFE_INTEGER = 9007199254740991;
    var argsTag = "[object Arguments]";
    var arrayTag = "[object Array]";
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var errorTag = "[object Error]";
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var objectTag = "[object Object]";
    var promiseTag = "[object Promise]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var symbolTag = "[object Symbol]";
    var weakMapTag = "[object WeakMap]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var float32Tag = "[object Float32Array]";
    var float64Tag = "[object Float64Array]";
    var int8Tag = "[object Int8Array]";
    var int16Tag = "[object Int16Array]";
    var int32Tag = "[object Int32Array]";
    var uint8Tag = "[object Uint8Array]";
    var uint8ClampedTag = "[object Uint8ClampedArray]";
    var uint16Tag = "[object Uint16Array]";
    var uint32Tag = "[object Uint32Array]";
    var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
    var reFlags = /\w*$/;
    var reIsHostCtor = /^\[object .+?Constructor\]$/;
    var reIsUint = /^(?:0|[1-9]\d*)$/;
    var cloneableTags = {};
    cloneableTags[argsTag] = cloneableTags[arrayTag] = cloneableTags[arrayBufferTag] = cloneableTags[dataViewTag] = cloneableTags[boolTag] = cloneableTags[dateTag] = cloneableTags[float32Tag] = cloneableTags[float64Tag] = cloneableTags[int8Tag] = cloneableTags[int16Tag] = cloneableTags[int32Tag] = cloneableTags[mapTag] = cloneableTags[numberTag] = cloneableTags[objectTag] = cloneableTags[regexpTag] = cloneableTags[setTag] = cloneableTags[stringTag] = cloneableTags[symbolTag] = cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] = cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
    cloneableTags[errorTag] = cloneableTags[funcTag] = cloneableTags[weakMapTag] = false;
    var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    var freeExports = typeof exports2 == "object" && exports2 && !exports2.nodeType && exports2;
    var freeModule = freeExports && typeof module2 == "object" && module2 && !module2.nodeType && module2;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    function addMapEntry(map, pair) {
      map.set(pair[0], pair[1]);
      return map;
    }
    function addSetEntry(set, value) {
      set.add(value);
      return set;
    }
    function arrayEach(array, iteratee) {
      var index = -1, length = array ? array.length : 0;
      while (++index < length) {
        if (iteratee(array[index], index, array) === false) {
          break;
        }
      }
      return array;
    }
    function arrayPush(array, values) {
      var index = -1, length = values.length, offset = array.length;
      while (++index < length) {
        array[offset + index] = values[index];
      }
      return array;
    }
    function arrayReduce(array, iteratee, accumulator, initAccum) {
      var index = -1, length = array ? array.length : 0;
      if (initAccum && length) {
        accumulator = array[++index];
      }
      while (++index < length) {
        accumulator = iteratee(accumulator, array[index], index, array);
      }
      return accumulator;
    }
    function baseTimes(n, iteratee) {
      var index = -1, result = Array(n);
      while (++index < n) {
        result[index] = iteratee(index);
      }
      return result;
    }
    function getValue(object, key) {
      return object == null ? void 0 : object[key];
    }
    function isHostObject(value) {
      var result = false;
      if (value != null && typeof value.toString != "function") {
        try {
          result = !!(value + "");
        } catch (e) {
        }
      }
      return result;
    }
    function mapToArray(map) {
      var index = -1, result = Array(map.size);
      map.forEach(function(value, key) {
        result[++index] = [key, value];
      });
      return result;
    }
    function overArg(func, transform) {
      return function(arg) {
        return func(transform(arg));
      };
    }
    function setToArray(set) {
      var index = -1, result = Array(set.size);
      set.forEach(function(value) {
        result[++index] = value;
      });
      return result;
    }
    var arrayProto = Array.prototype;
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var coreJsData = root["__core-js_shared__"];
    var maskSrcKey = (function() {
      var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
      return uid ? "Symbol(src)_1." + uid : "";
    })();
    var funcToString = funcProto.toString;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var objectToString = objectProto.toString;
    var reIsNative = RegExp(
      "^" + funcToString.call(hasOwnProperty).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
    );
    var Buffer2 = moduleExports ? root.Buffer : void 0;
    var Symbol2 = root.Symbol;
    var Uint8Array2 = root.Uint8Array;
    var getPrototype = overArg(Object.getPrototypeOf, Object);
    var objectCreate = Object.create;
    var propertyIsEnumerable = objectProto.propertyIsEnumerable;
    var splice = arrayProto.splice;
    var nativeGetSymbols = Object.getOwnPropertySymbols;
    var nativeIsBuffer = Buffer2 ? Buffer2.isBuffer : void 0;
    var nativeKeys = overArg(Object.keys, Object);
    var DataView2 = getNative(root, "DataView");
    var Map2 = getNative(root, "Map");
    var Promise2 = getNative(root, "Promise");
    var Set2 = getNative(root, "Set");
    var WeakMap2 = getNative(root, "WeakMap");
    var nativeCreate = getNative(Object, "create");
    var dataViewCtorString = toSource(DataView2);
    var mapCtorString = toSource(Map2);
    var promiseCtorString = toSource(Promise2);
    var setCtorString = toSource(Set2);
    var weakMapCtorString = toSource(WeakMap2);
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolValueOf = symbolProto ? symbolProto.valueOf : void 0;
    function Hash(entries) {
      var index = -1, length = entries ? entries.length : 0;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    function hashClear() {
      this.__data__ = nativeCreate ? nativeCreate(null) : {};
    }
    function hashDelete(key) {
      return this.has(key) && delete this.__data__[key];
    }
    function hashGet(key) {
      var data = this.__data__;
      if (nativeCreate) {
        var result = data[key];
        return result === HASH_UNDEFINED ? void 0 : result;
      }
      return hasOwnProperty.call(data, key) ? data[key] : void 0;
    }
    function hashHas(key) {
      var data = this.__data__;
      return nativeCreate ? data[key] !== void 0 : hasOwnProperty.call(data, key);
    }
    function hashSet(key, value) {
      var data = this.__data__;
      data[key] = nativeCreate && value === void 0 ? HASH_UNDEFINED : value;
      return this;
    }
    Hash.prototype.clear = hashClear;
    Hash.prototype["delete"] = hashDelete;
    Hash.prototype.get = hashGet;
    Hash.prototype.has = hashHas;
    Hash.prototype.set = hashSet;
    function ListCache(entries) {
      var index = -1, length = entries ? entries.length : 0;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    function listCacheClear() {
      this.__data__ = [];
    }
    function listCacheDelete(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        return false;
      }
      var lastIndex = data.length - 1;
      if (index == lastIndex) {
        data.pop();
      } else {
        splice.call(data, index, 1);
      }
      return true;
    }
    function listCacheGet(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      return index < 0 ? void 0 : data[index][1];
    }
    function listCacheHas(key) {
      return assocIndexOf(this.__data__, key) > -1;
    }
    function listCacheSet(key, value) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        data.push([key, value]);
      } else {
        data[index][1] = value;
      }
      return this;
    }
    ListCache.prototype.clear = listCacheClear;
    ListCache.prototype["delete"] = listCacheDelete;
    ListCache.prototype.get = listCacheGet;
    ListCache.prototype.has = listCacheHas;
    ListCache.prototype.set = listCacheSet;
    function MapCache(entries) {
      var index = -1, length = entries ? entries.length : 0;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    function mapCacheClear() {
      this.__data__ = {
        "hash": new Hash(),
        "map": new (Map2 || ListCache)(),
        "string": new Hash()
      };
    }
    function mapCacheDelete(key) {
      return getMapData(this, key)["delete"](key);
    }
    function mapCacheGet(key) {
      return getMapData(this, key).get(key);
    }
    function mapCacheHas(key) {
      return getMapData(this, key).has(key);
    }
    function mapCacheSet(key, value) {
      getMapData(this, key).set(key, value);
      return this;
    }
    MapCache.prototype.clear = mapCacheClear;
    MapCache.prototype["delete"] = mapCacheDelete;
    MapCache.prototype.get = mapCacheGet;
    MapCache.prototype.has = mapCacheHas;
    MapCache.prototype.set = mapCacheSet;
    function Stack(entries) {
      this.__data__ = new ListCache(entries);
    }
    function stackClear() {
      this.__data__ = new ListCache();
    }
    function stackDelete(key) {
      return this.__data__["delete"](key);
    }
    function stackGet(key) {
      return this.__data__.get(key);
    }
    function stackHas(key) {
      return this.__data__.has(key);
    }
    function stackSet(key, value) {
      var cache = this.__data__;
      if (cache instanceof ListCache) {
        var pairs = cache.__data__;
        if (!Map2 || pairs.length < LARGE_ARRAY_SIZE - 1) {
          pairs.push([key, value]);
          return this;
        }
        cache = this.__data__ = new MapCache(pairs);
      }
      cache.set(key, value);
      return this;
    }
    Stack.prototype.clear = stackClear;
    Stack.prototype["delete"] = stackDelete;
    Stack.prototype.get = stackGet;
    Stack.prototype.has = stackHas;
    Stack.prototype.set = stackSet;
    function arrayLikeKeys(value, inherited) {
      var result = isArray(value) || isArguments(value) ? baseTimes(value.length, String) : [];
      var length = result.length, skipIndexes = !!length;
      for (var key in value) {
        if ((inherited || hasOwnProperty.call(value, key)) && !(skipIndexes && (key == "length" || isIndex(key, length)))) {
          result.push(key);
        }
      }
      return result;
    }
    function assignValue(object, key, value) {
      var objValue = object[key];
      if (!(hasOwnProperty.call(object, key) && eq(objValue, value)) || value === void 0 && !(key in object)) {
        object[key] = value;
      }
    }
    function assocIndexOf(array, key) {
      var length = array.length;
      while (length--) {
        if (eq(array[length][0], key)) {
          return length;
        }
      }
      return -1;
    }
    function baseAssign(object, source) {
      return object && copyObject(source, keys(source), object);
    }
    function baseClone(value, isDeep, isFull, customizer, key, object, stack) {
      var result;
      if (customizer) {
        result = object ? customizer(value, key, object, stack) : customizer(value);
      }
      if (result !== void 0) {
        return result;
      }
      if (!isObject(value)) {
        return value;
      }
      var isArr = isArray(value);
      if (isArr) {
        result = initCloneArray(value);
        if (!isDeep) {
          return copyArray(value, result);
        }
      } else {
        var tag = getTag(value), isFunc = tag == funcTag || tag == genTag;
        if (isBuffer(value)) {
          return cloneBuffer(value, isDeep);
        }
        if (tag == objectTag || tag == argsTag || isFunc && !object) {
          if (isHostObject(value)) {
            return object ? value : {};
          }
          result = initCloneObject(isFunc ? {} : value);
          if (!isDeep) {
            return copySymbols(value, baseAssign(result, value));
          }
        } else {
          if (!cloneableTags[tag]) {
            return object ? value : {};
          }
          result = initCloneByTag(value, tag, baseClone, isDeep);
        }
      }
      stack || (stack = new Stack());
      var stacked = stack.get(value);
      if (stacked) {
        return stacked;
      }
      stack.set(value, result);
      if (!isArr) {
        var props = isFull ? getAllKeys(value) : keys(value);
      }
      arrayEach(props || value, function(subValue, key2) {
        if (props) {
          key2 = subValue;
          subValue = value[key2];
        }
        assignValue(result, key2, baseClone(subValue, isDeep, isFull, customizer, key2, value, stack));
      });
      return result;
    }
    function baseCreate(proto) {
      return isObject(proto) ? objectCreate(proto) : {};
    }
    function baseGetAllKeys(object, keysFunc, symbolsFunc) {
      var result = keysFunc(object);
      return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
    }
    function baseGetTag(value) {
      return objectToString.call(value);
    }
    function baseIsNative(value) {
      if (!isObject(value) || isMasked(value)) {
        return false;
      }
      var pattern = isFunction(value) || isHostObject(value) ? reIsNative : reIsHostCtor;
      return pattern.test(toSource(value));
    }
    function baseKeys(object) {
      if (!isPrototype(object)) {
        return nativeKeys(object);
      }
      var result = [];
      for (var key in Object(object)) {
        if (hasOwnProperty.call(object, key) && key != "constructor") {
          result.push(key);
        }
      }
      return result;
    }
    function cloneBuffer(buffer, isDeep) {
      if (isDeep) {
        return buffer.slice();
      }
      var result = new buffer.constructor(buffer.length);
      buffer.copy(result);
      return result;
    }
    function cloneArrayBuffer(arrayBuffer) {
      var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
      new Uint8Array2(result).set(new Uint8Array2(arrayBuffer));
      return result;
    }
    function cloneDataView(dataView, isDeep) {
      var buffer = isDeep ? cloneArrayBuffer(dataView.buffer) : dataView.buffer;
      return new dataView.constructor(buffer, dataView.byteOffset, dataView.byteLength);
    }
    function cloneMap(map, isDeep, cloneFunc) {
      var array = isDeep ? cloneFunc(mapToArray(map), true) : mapToArray(map);
      return arrayReduce(array, addMapEntry, new map.constructor());
    }
    function cloneRegExp(regexp) {
      var result = new regexp.constructor(regexp.source, reFlags.exec(regexp));
      result.lastIndex = regexp.lastIndex;
      return result;
    }
    function cloneSet(set, isDeep, cloneFunc) {
      var array = isDeep ? cloneFunc(setToArray(set), true) : setToArray(set);
      return arrayReduce(array, addSetEntry, new set.constructor());
    }
    function cloneSymbol(symbol) {
      return symbolValueOf ? Object(symbolValueOf.call(symbol)) : {};
    }
    function cloneTypedArray(typedArray, isDeep) {
      var buffer = isDeep ? cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
      return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
    }
    function copyArray(source, array) {
      var index = -1, length = source.length;
      array || (array = Array(length));
      while (++index < length) {
        array[index] = source[index];
      }
      return array;
    }
    function copyObject(source, props, object, customizer) {
      object || (object = {});
      var index = -1, length = props.length;
      while (++index < length) {
        var key = props[index];
        var newValue = customizer ? customizer(object[key], source[key], key, object, source) : void 0;
        assignValue(object, key, newValue === void 0 ? source[key] : newValue);
      }
      return object;
    }
    function copySymbols(source, object) {
      return copyObject(source, getSymbols(source), object);
    }
    function getAllKeys(object) {
      return baseGetAllKeys(object, keys, getSymbols);
    }
    function getMapData(map, key) {
      var data = map.__data__;
      return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
    }
    function getNative(object, key) {
      var value = getValue(object, key);
      return baseIsNative(value) ? value : void 0;
    }
    var getSymbols = nativeGetSymbols ? overArg(nativeGetSymbols, Object) : stubArray;
    var getTag = baseGetTag;
    if (DataView2 && getTag(new DataView2(new ArrayBuffer(1))) != dataViewTag || Map2 && getTag(new Map2()) != mapTag || Promise2 && getTag(Promise2.resolve()) != promiseTag || Set2 && getTag(new Set2()) != setTag || WeakMap2 && getTag(new WeakMap2()) != weakMapTag) {
      getTag = function(value) {
        var result = objectToString.call(value), Ctor = result == objectTag ? value.constructor : void 0, ctorString = Ctor ? toSource(Ctor) : void 0;
        if (ctorString) {
          switch (ctorString) {
            case dataViewCtorString:
              return dataViewTag;
            case mapCtorString:
              return mapTag;
            case promiseCtorString:
              return promiseTag;
            case setCtorString:
              return setTag;
            case weakMapCtorString:
              return weakMapTag;
          }
        }
        return result;
      };
    }
    function initCloneArray(array) {
      var length = array.length, result = array.constructor(length);
      if (length && typeof array[0] == "string" && hasOwnProperty.call(array, "index")) {
        result.index = array.index;
        result.input = array.input;
      }
      return result;
    }
    function initCloneObject(object) {
      return typeof object.constructor == "function" && !isPrototype(object) ? baseCreate(getPrototype(object)) : {};
    }
    function initCloneByTag(object, tag, cloneFunc, isDeep) {
      var Ctor = object.constructor;
      switch (tag) {
        case arrayBufferTag:
          return cloneArrayBuffer(object);
        case boolTag:
        case dateTag:
          return new Ctor(+object);
        case dataViewTag:
          return cloneDataView(object, isDeep);
        case float32Tag:
        case float64Tag:
        case int8Tag:
        case int16Tag:
        case int32Tag:
        case uint8Tag:
        case uint8ClampedTag:
        case uint16Tag:
        case uint32Tag:
          return cloneTypedArray(object, isDeep);
        case mapTag:
          return cloneMap(object, isDeep, cloneFunc);
        case numberTag:
        case stringTag:
          return new Ctor(object);
        case regexpTag:
          return cloneRegExp(object);
        case setTag:
          return cloneSet(object, isDeep, cloneFunc);
        case symbolTag:
          return cloneSymbol(object);
      }
    }
    function isIndex(value, length) {
      length = length == null ? MAX_SAFE_INTEGER : length;
      return !!length && (typeof value == "number" || reIsUint.test(value)) && (value > -1 && value % 1 == 0 && value < length);
    }
    function isKeyable(value) {
      var type = typeof value;
      return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
    }
    function isMasked(func) {
      return !!maskSrcKey && maskSrcKey in func;
    }
    function isPrototype(value) {
      var Ctor = value && value.constructor, proto = typeof Ctor == "function" && Ctor.prototype || objectProto;
      return value === proto;
    }
    function toSource(func) {
      if (func != null) {
        try {
          return funcToString.call(func);
        } catch (e) {
        }
        try {
          return func + "";
        } catch (e) {
        }
      }
      return "";
    }
    function cloneDeep(value) {
      return baseClone(value, true, true);
    }
    function eq(value, other) {
      return value === other || value !== value && other !== other;
    }
    function isArguments(value) {
      return isArrayLikeObject(value) && hasOwnProperty.call(value, "callee") && (!propertyIsEnumerable.call(value, "callee") || objectToString.call(value) == argsTag);
    }
    var isArray = Array.isArray;
    function isArrayLike(value) {
      return value != null && isLength(value.length) && !isFunction(value);
    }
    function isArrayLikeObject(value) {
      return isObjectLike(value) && isArrayLike(value);
    }
    var isBuffer = nativeIsBuffer || stubFalse;
    function isFunction(value) {
      var tag = isObject(value) ? objectToString.call(value) : "";
      return tag == funcTag || tag == genTag;
    }
    function isLength(value) {
      return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
    }
    function isObject(value) {
      var type = typeof value;
      return !!value && (type == "object" || type == "function");
    }
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function keys(object) {
      return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
    }
    function stubArray() {
      return [];
    }
    function stubFalse() {
      return false;
    }
    module2.exports = cloneDeep;
  }
});

// node_modules/lodash.chunk/index.js
var require_lodash2 = __commonJS({
  "node_modules/lodash.chunk/index.js"(exports2, module2) {
    var INFINITY = 1 / 0;
    var MAX_SAFE_INTEGER = 9007199254740991;
    var MAX_INTEGER = 17976931348623157e292;
    var NAN = 0 / 0;
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var symbolTag = "[object Symbol]";
    var reTrim = /^\s+|\s+$/g;
    var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
    var reIsBinary = /^0b[01]+$/i;
    var reIsOctal = /^0o[0-7]+$/i;
    var reIsUint = /^(?:0|[1-9]\d*)$/;
    var freeParseInt = parseInt;
    var objectProto = Object.prototype;
    var objectToString = objectProto.toString;
    var nativeCeil = Math.ceil;
    var nativeMax = Math.max;
    function baseSlice(array, start2, end) {
      var index = -1, length = array.length;
      if (start2 < 0) {
        start2 = -start2 > length ? 0 : length + start2;
      }
      end = end > length ? length : end;
      if (end < 0) {
        end += length;
      }
      length = start2 > end ? 0 : end - start2 >>> 0;
      start2 >>>= 0;
      var result = Array(length);
      while (++index < length) {
        result[index] = array[index + start2];
      }
      return result;
    }
    function isIndex(value, length) {
      length = length == null ? MAX_SAFE_INTEGER : length;
      return !!length && (typeof value == "number" || reIsUint.test(value)) && (value > -1 && value % 1 == 0 && value < length);
    }
    function isIterateeCall(value, index, object) {
      if (!isObject(object)) {
        return false;
      }
      var type = typeof index;
      if (type == "number" ? isArrayLike(object) && isIndex(index, object.length) : type == "string" && index in object) {
        return eq(object[index], value);
      }
      return false;
    }
    function chunk(array, size, guard) {
      if (guard ? isIterateeCall(array, size, guard) : size === void 0) {
        size = 1;
      } else {
        size = nativeMax(toInteger(size), 0);
      }
      var length = array ? array.length : 0;
      if (!length || size < 1) {
        return [];
      }
      var index = 0, resIndex = 0, result = Array(nativeCeil(length / size));
      while (index < length) {
        result[resIndex++] = baseSlice(array, index, index += size);
      }
      return result;
    }
    function eq(value, other) {
      return value === other || value !== value && other !== other;
    }
    function isArrayLike(value) {
      return value != null && isLength(value.length) && !isFunction(value);
    }
    function isFunction(value) {
      var tag = isObject(value) ? objectToString.call(value) : "";
      return tag == funcTag || tag == genTag;
    }
    function isLength(value) {
      return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
    }
    function isObject(value) {
      var type = typeof value;
      return !!value && (type == "object" || type == "function");
    }
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isSymbol(value) {
      return typeof value == "symbol" || isObjectLike(value) && objectToString.call(value) == symbolTag;
    }
    function toFinite(value) {
      if (!value) {
        return value === 0 ? value : 0;
      }
      value = toNumber(value);
      if (value === INFINITY || value === -INFINITY) {
        var sign = value < 0 ? -1 : 1;
        return sign * MAX_INTEGER;
      }
      return value === value ? value : 0;
    }
    function toInteger(value) {
      var result = toFinite(value), remainder = result % 1;
      return result === result ? remainder ? result - remainder : result : 0;
    }
    function toNumber(value) {
      if (typeof value == "number") {
        return value;
      }
      if (isSymbol(value)) {
        return NAN;
      }
      if (isObject(value)) {
        var other = typeof value.valueOf == "function" ? value.valueOf() : value;
        value = isObject(other) ? other + "" : other;
      }
      if (typeof value != "string") {
        return value === 0 ? value : +value;
      }
      value = value.replace(reTrim, "");
      var isBinary = reIsBinary.test(value);
      return isBinary || reIsOctal.test(value) ? freeParseInt(value.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value) ? NAN : +value;
    }
    module2.exports = chunk;
  }
});

// node_modules/lodash.flatten/index.js
var require_lodash3 = __commonJS({
  "node_modules/lodash.flatten/index.js"(exports2, module2) {
    var MAX_SAFE_INTEGER = 9007199254740991;
    var argsTag = "[object Arguments]";
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    function arrayPush(array, values) {
      var index = -1, length = values.length, offset = array.length;
      while (++index < length) {
        array[offset + index] = values[index];
      }
      return array;
    }
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var objectToString = objectProto.toString;
    var Symbol2 = root.Symbol;
    var propertyIsEnumerable = objectProto.propertyIsEnumerable;
    var spreadableSymbol = Symbol2 ? Symbol2.isConcatSpreadable : void 0;
    function baseFlatten(array, depth, predicate, isStrict, result) {
      var index = -1, length = array.length;
      predicate || (predicate = isFlattenable);
      result || (result = []);
      while (++index < length) {
        var value = array[index];
        if (depth > 0 && predicate(value)) {
          if (depth > 1) {
            baseFlatten(value, depth - 1, predicate, isStrict, result);
          } else {
            arrayPush(result, value);
          }
        } else if (!isStrict) {
          result[result.length] = value;
        }
      }
      return result;
    }
    function isFlattenable(value) {
      return isArray(value) || isArguments(value) || !!(spreadableSymbol && value && value[spreadableSymbol]);
    }
    function flatten(array) {
      var length = array ? array.length : 0;
      return length ? baseFlatten(array, 1) : [];
    }
    function isArguments(value) {
      return isArrayLikeObject(value) && hasOwnProperty.call(value, "callee") && (!propertyIsEnumerable.call(value, "callee") || objectToString.call(value) == argsTag);
    }
    var isArray = Array.isArray;
    function isArrayLike(value) {
      return value != null && isLength(value.length) && !isFunction(value);
    }
    function isArrayLikeObject(value) {
      return isObjectLike(value) && isArrayLike(value);
    }
    function isFunction(value) {
      var tag = isObject(value) ? objectToString.call(value) : "";
      return tag == funcTag || tag == genTag;
    }
    function isLength(value) {
      return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
    }
    function isObject(value) {
      var type = typeof value;
      return !!value && (type == "object" || type == "function");
    }
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    module2.exports = flatten;
  }
});

// node_modules/autocannon/lib/requestIterator.js
var require_requestIterator = __commonJS({
  "node_modules/autocannon/lib/requestIterator.js"(exports2, module2) {
    "use strict";
    var hyperid = require_hyperid()(true);
    var inherits = require("util").inherits;
    var requestBuilder = require_httpRequestBuilder();
    var clone = require_lodash();
    var chunk = require_lodash2();
    var flatten = require_lodash3();
    var toHeaderKeyValue = (rawHeaders) => {
      const tupleHeaders = chunk(rawHeaders, 2);
      const headers = {};
      tupleHeaders.forEach((val) => {
        const currentValue = headers[val[0]];
        if (!currentValue) {
          headers[val[0]] = val[1];
        } else {
          headers[val[0]] = flatten([currentValue, val[1]]);
        }
      });
      return headers;
    };
    function RequestIterator(opts) {
      if (!(this instanceof RequestIterator)) {
        return new RequestIterator(opts);
      }
      this.resetted = false;
      this.headers = {};
      this.initialContext = opts.initialContext || {};
      this.resetContext();
      this.reqDefaults = opts;
      this.requestBuilder = requestBuilder(opts);
      this.setRequests(opts.requests);
    }
    inherits(RequestIterator, Object);
    RequestIterator.prototype.resetContext = function() {
      this.context = clone(this.initialContext);
    };
    RequestIterator.prototype.nextRequest = function() {
      this.resetted = false;
      ++this.currentRequestIndex;
      if (this.currentRequestIndex === this.requests.length) {
        this.resetContext();
        this.currentRequestIndex = 0;
      }
      this.currentRequest = this.requests[this.currentRequestIndex];
      if (this.reqDefaults.idReplacement || typeof this.currentRequest.setupRequest === "function") {
        this.rebuildRequest();
      }
      return this.currentRequest;
    };
    RequestIterator.prototype.nextRequestBuffer = function() {
      this.nextRequest();
      return this.currentRequest.requestBuffer;
    };
    RequestIterator.prototype.setRequests = function(newRequests) {
      this.resetted = false;
      this.requests = newRequests || [{}];
      this.currentRequestIndex = 0;
      this.requests.forEach((request, i) => {
        this.currentRequest = request;
        if (i === 0 || typeof request.setupRequest !== "function") {
          this.rebuildRequest();
        }
      });
      this.currentRequest = this.requests[0];
    };
    RequestIterator.prototype.setHeaders = function(newHeaders) {
      this.headers = newHeaders || {};
      this.currentRequest.headers = this.headers;
      this.rebuildRequest();
    };
    RequestIterator.prototype.setBody = function(newBody) {
      this.currentRequest.body = newBody || Buffer.alloc(0);
      this.rebuildRequest();
    };
    RequestIterator.prototype.setHeadersAndBody = function(newHeaders, newBody) {
      this.headers = newHeaders || {};
      this.currentRequest.headers = this.headers;
      this.currentRequest.body = newBody || Buffer.alloc(0);
      this.rebuildRequest();
    };
    RequestIterator.prototype.setRequest = function(newRequest) {
      this.currentRequest = newRequest || {};
      this.rebuildRequest();
    };
    RequestIterator.prototype.rebuildRequest = function() {
      let data;
      this.resetted = false;
      if (this.currentRequest) {
        this.currentRequest.headers = this.currentRequest.headers || this.headers;
        data = this.requestBuilder(this.currentRequest, this.context);
        if (data) {
          this.currentRequest.requestBuffer = this.reqDefaults.idReplacement ? Buffer.from(data.toString().replace(/\[<id>\]/g, hyperid())) : data;
        } else if (this.currentRequestIndex === 0) {
          throw new Error("First setupRequest() failed did not returned valid request. Stopping");
        } else {
          this.currentRequestIndex = this.requests.length - 1;
          this.nextRequest();
          this.resetted = true;
        }
      }
      return data;
    };
    RequestIterator.prototype.recordBody = function(request, status, body, headers) {
      if (request && typeof request.onResponse === "function") {
        request.onResponse(status, body, this.context, toHeaderKeyValue(headers || []));
      }
    };
    module2.exports = RequestIterator;
  }
});

// node_modules/autocannon/lib/pipelinedRequestsQueue.js
var require_pipelinedRequestsQueue = __commonJS({
  "node_modules/autocannon/lib/pipelinedRequestsQueue.js"(exports2, module2) {
    "use strict";
    var PipelinedRequestsQueue = class {
      constructor() {
        this.pendingRequests = [];
      }
      insertRequest(req) {
        this.pendingRequests.push({
          req,
          bytes: 0,
          body: "",
          headers: {},
          startTime: process.hrtime()
        });
      }
      peek() {
        if (this.pendingRequests.length > 0) {
          return this.pendingRequests[0];
        }
      }
      addByteCount(count) {
        const req = this.peek();
        if (req) {
          req.bytes += count;
        }
      }
      addBody(data) {
        const req = this.peek();
        if (req) {
          req.body += data;
        }
      }
      setHeaders(headers) {
        const req = this.peek();
        if (req) {
          req.headers = headers;
        }
      }
      size() {
        return this.pendingRequests.length;
      }
      /** Terminates the first-in request
       * This will calculate the request duration, remove it from the queue and return its data
       **/
      terminateRequest() {
        if (this.pendingRequests.length > 0) {
          const data = this.pendingRequests.shift();
          const hrduration = process.hrtime(data.startTime);
          data.duration = hrduration[0] * 1e3 + hrduration[1] / 1e6;
          return data;
        }
      }
      clear() {
        this.pendingRequests = [];
      }
      toArray() {
        return this.pendingRequests;
      }
    };
    module2.exports = PipelinedRequestsQueue;
  }
});

// node_modules/autocannon/lib/httpClient.js
var require_httpClient = __commonJS({
  "node_modules/autocannon/lib/httpClient.js"(exports2, module2) {
    "use strict";
    var inherits = require("util").inherits;
    var EE = require("events").EventEmitter;
    var net2 = require("net");
    var tls = require("tls");
    var retimer = require_retimer();
    var HTTPParser = require_http_parser().HTTPParser;
    var RequestIterator = require_requestIterator();
    var noop = require_noop();
    var clone = require_lodash();
    var PipelinedRequestsQueue = require_pipelinedRequestsQueue();
    function Client(opts) {
      if (!(this instanceof Client)) {
        return new Client(opts);
      }
      this.opts = clone(opts);
      this.opts.setupClient = this.opts.setupClient || noop;
      this.opts.pipelining = this.opts.pipelining || 1;
      this.opts.port = this.opts.port || 80;
      this.opts.expectBody = this.opts.expectBody || null;
      this.opts.tlsOptions = this.opts.tlsOptions || {};
      this.timeout = (this.opts.timeout || 10) * 1e3;
      this.ipc = !!this.opts.socketPath;
      this.secure = this.opts.protocol === "https:";
      this.auth = this.opts.auth || null;
      if (this.secure && this.opts.port === 80) {
        this.opts.port = 443;
      }
      this.parser = new HTTPParser(HTTPParser.RESPONSE);
      this.requestIterator = new RequestIterator(this.opts);
      this.reqsMade = 0;
      this.responseMax = this.opts.responseMax;
      this.reqsMadeThisSecond = 0;
      this.rate = this.opts.rate;
      this.reconnectRate = this.opts.reconnectRate;
      this.pipelinedRequests = new PipelinedRequestsQueue();
      this.destroyed = false;
      this.opts.setupClient(this);
      const handleTimeout = () => {
        this._destroyConnection();
        this.timeoutTicker.reschedule(this.timeout);
        this._connect();
        for (let i = 0; i < this.opts.pipelining; i++) {
          this.emit("timeout");
        }
      };
      if (this.rate) {
        this.rateInterval = setInterval(() => {
          this.reqsMadeThisSecond = 0;
          if (this.paused) this._doRequest(this.cer);
          this.paused = false;
        }, 1e3);
      }
      this.timeoutTicker = retimer(handleTimeout, this.timeout);
      this.parser[HTTPParser.kOnHeaders] = () => {
      };
      this.parser[HTTPParser.kOnHeadersComplete] = (opts2) => {
        this.emit("headers", opts2);
        this.pipelinedRequests.setHeaders(opts2);
      };
      this.parser[HTTPParser.kOnBody] = (body, start2, len) => {
        this.pipelinedRequests.addBody(body.slice(start2, start2 + len));
        this.emit("body", body);
      };
      this.parser[HTTPParser.kOnMessageComplete] = () => {
        const resp = this.pipelinedRequests.terminateRequest();
        if (!this.destroyed && this.reconnectRate && this.reqsMade % this.reconnectRate === 0) {
          return this._resetConnection();
        }
        if (!this.destroyed) {
          this.requestIterator.recordBody(resp.req, resp.headers.statusCode, resp.body, resp.headers.headers);
          this.emit("response", resp.headers.statusCode, resp.bytes, resp.duration, this.rate);
          this._doRequest();
          const isFn = typeof this.opts.verifyBody === "function";
          if (isFn && !this.opts.verifyBody(resp.body)) {
            return this.emit("mismatch", resp.body);
          } else if (!isFn && this.opts.expectBody && this.opts.expectBody !== resp.body) {
            return this.emit("mismatch", resp.body);
          }
        }
      };
      this._connect();
    }
    inherits(Client, EE);
    Client.prototype._connect = function() {
      if (this.secure) {
        let servername;
        if (this.opts.servername) {
          servername = this.opts.servername;
        } else if (!net2.isIP(this.opts.hostname)) {
          servername = this.opts.hostname;
        }
        if (this.ipc) {
          this.conn = tls.connect(this.opts.socketPath, { ...this.opts.tlsOptions, rejectUnauthorized: false });
        } else {
          this.conn = tls.connect(this.opts.port, this.opts.hostname, { ...this.opts.tlsOptions, rejectUnauthorized: false, servername });
        }
      } else {
        if (this.ipc) {
          this.conn = net2.connect(this.opts.socketPath);
        } else {
          this.conn = net2.connect(this.opts.port, this.opts.hostname);
        }
      }
      this.conn.on("error", (error) => {
        this.emit("connError", error);
        if (!this.destroyed) this._connect();
      });
      this.conn.on("data", (chunk) => {
        this.pipelinedRequests.addByteCount(chunk.length);
        this.parser.execute(chunk);
      });
      this.conn.on("end", () => {
        if (!this.destroyed) this._connect();
      });
      for (let i = 0; i < this.opts.pipelining; i++) {
        this._doRequest();
      }
    };
    Client.prototype._doRequest = function() {
      if (!this.rate || this.rate && this.reqsMadeThisSecond++ < this.rate) {
        if (!this.destroyed && this.responseMax && this.reqsMade >= this.responseMax) {
          return this.destroy();
        }
        this.emit("request");
        if (this.reqsMade > 0) {
          this.requestIterator.nextRequest();
          if (this.requestIterator.resetted) {
            this.emit("reset");
          }
        }
        this.pipelinedRequests.insertRequest(this.requestIterator.currentRequest);
        this.conn.write(this.getRequestBuffer());
        this.timeoutTicker.reschedule(this.timeout);
        this.reqsMade++;
      } else {
        this.paused = true;
      }
    };
    Client.prototype._resetConnection = function() {
      this._destroyConnection();
      this._connect();
    };
    Client.prototype._destroyConnection = function() {
      this.conn.removeAllListeners("error");
      this.conn.removeAllListeners("end");
      this.conn.on("error", () => {
      });
      this.conn.destroy();
      this.pipelinedRequests.clear();
    };
    Client.prototype.destroy = function() {
      if (!this.destroyed) {
        this.destroyed = true;
        this.timeoutTicker.clear();
        if (this.rate) clearInterval(this.rateInterval);
        this.emit("done");
        this._destroyConnection();
      }
    };
    Client.prototype.getRequestBuffer = function() {
      return this.requestIterator.currentRequest.requestBuffer;
    };
    Client.prototype.setHeaders = function(newHeaders) {
      this._okayToUpdateCheck();
      this.requestIterator.setHeaders(newHeaders);
    };
    Client.prototype.setBody = function(newBody) {
      this._okayToUpdateCheck();
      this.requestIterator.setBody(newBody);
    };
    Client.prototype.setHeadersAndBody = function(newHeaders, newBody) {
      this._okayToUpdateCheck();
      this.requestIterator.setHeadersAndBody(newHeaders, newBody);
    };
    Client.prototype.setRequest = function(newRequest) {
      this._okayToUpdateCheck();
      this.requestIterator.setRequest(newRequest);
    };
    Client.prototype.setRequests = function(newRequests) {
      this._okayToUpdateCheck();
      this.requestIterator.setRequests(newRequests);
    };
    Client.prototype._okayToUpdateCheck = function() {
      if (this.opts.pipelining > 1) {
        throw new Error("cannot update requests when the piplining factor is greater than 1");
      }
    };
    module2.exports = Client;
  }
});

// node_modules/autocannon/lib/run.js
var require_run = __commonJS({
  "node_modules/autocannon/lib/run.js"(exports2, module2) {
    "use strict";
    var URL3 = require("url");
    var reInterval = require_reinterval();
    var EE = require("events").EventEmitter;
    var Client = require_httpClient();
    var { isMainThread } = require_worker_threads();
    var { ofURL: ofURL2 } = require_url();
    var aggregateResult2 = require_aggregateResult();
    var { getHistograms, encodeHist } = require_histUtil();
    var defaults2 = {
      harRequests: /* @__PURE__ */ new Map()
    };
    function run(opts, tracker, cb) {
      opts = Object.assign({}, defaults2, opts);
      tracker = tracker || new EE();
      const histograms = getHistograms(opts.histograms);
      const { latencies, requests, throughput } = histograms;
      const statusCodes = [
        0,
        // 1xx
        0,
        // 2xx
        0,
        // 3xx
        0,
        // 4xx
        0
        // 5xx
      ];
      const statusCodeStats = {};
      if (opts.overallRate && opts.overallRate < opts.connections) opts.connections = opts.overallRate;
      let counter = 0;
      let bytes = 0;
      let errors = 0;
      let timeouts = 0;
      let mismatches = 0;
      let totalBytes = 0;
      let totalRequests = 0;
      let totalCompletedRequests = 0;
      let samples = 0;
      let resets = 0;
      const amount = opts.amount;
      let stop = false;
      let restart = true;
      let numRunning = opts.connections;
      let startTime = Date.now();
      const includeErrorStats = !opts.excludeErrorStats;
      opts.url = ofURL2(opts.url).map((url) => {
        if (url.indexOf("http") !== 0) return "http://" + url;
        return url;
      });
      const urls = ofURL2(opts.url, true).map((url) => {
        if (url.indexOf("http") !== 0) url = "http://" + url;
        url = URL3.parse(url);
        url.pipelining = opts.pipelining;
        url.method = opts.method;
        url.body = opts.form ? opts.form.getBuffer() : opts.body;
        url.headers = opts.form ? Object.assign({}, opts.headers, opts.form.getHeaders()) : opts.headers;
        url.setupClient = opts.setupClient;
        url.verifyBody = opts.verifyBody;
        url.timeout = opts.timeout;
        url.origin = `${url.protocol}//${url.host}`;
        url.requests = opts.harRequests.get(url.origin) || opts.requests;
        url.reconnectRate = opts.reconnectRate;
        url.responseMax = amount || opts.maxConnectionRequests || opts.maxOverallRequests;
        url.rate = opts.connectionRate || opts.overallRate;
        url.idReplacement = opts.idReplacement;
        url.socketPath = opts.socketPath;
        url.servername = opts.servername;
        url.expectBody = opts.expectBody;
        return url;
      });
      let stopTimer;
      let clients = [];
      initialiseClients(clients);
      if (!amount) {
        stopTimer = setTimeout(() => {
          stop = true;
        }, opts.duration * 1e3);
      }
      const second = reInterval(tickProgressBar, 1e3);
      const interval = reInterval(tickInterval, opts.sampleInt);
      setImmediate(() => {
        tracker.emit("start");
      });
      function tickProgressBar() {
        tracker.emit("tick", { counter, bytes });
      }
      function tickInterval() {
        totalBytes += bytes;
        totalCompletedRequests += counter;
        samples += 1;
        requests.recordValue(counter);
        throughput.recordValue(bytes);
        counter = 0;
        bytes = 0;
        if (stop) {
          if (stopTimer) clearTimeout(stopTimer);
          tracker.emit("tick", { counter, bytes });
          second.clear();
          interval.clear();
          clients.forEach((client) => client.destroy());
          const result = {
            latencies: encodeHist(latencies),
            requests: encodeHist(requests),
            throughput: encodeHist(throughput),
            totalCompletedRequests,
            totalRequests,
            totalBytes,
            samples,
            errors,
            timeouts,
            mismatches,
            non2xx: statusCodes[0] + statusCodes[2] + statusCodes[3] + statusCodes[4],
            statusCodeStats,
            resets,
            duration: Math.round((Date.now() - startTime) / 10) / 100,
            start: new Date(startTime),
            finish: /* @__PURE__ */ new Date()
          };
          statusCodes.forEach((code, index) => {
            result[index + 1 + "xx"] = code;
          });
          const resultObj = isMainThread && !opts.skipAggregateResult ? aggregateResult2(result, opts, histograms) : result;
          if (opts.forever) {
            tracker.emit("done", resultObj);
          } else {
            latencies.destroy();
            requests.destroy();
            throughput.destroy();
            cb(null, resultObj);
          }
          const restartFn = () => {
            stop = false;
            stopTimer = setTimeout(() => {
              stop = true;
            }, opts.duration * 1e3);
            errors = 0;
            timeouts = 0;
            mismatches = 0;
            totalBytes = 0;
            totalRequests = 0;
            totalCompletedRequests = 0;
            resets = 0;
            statusCodes.fill(0);
            requests.reset();
            latencies.reset();
            throughput.reset();
            startTime = Date.now();
            if (opts.overallRate && opts.overallRate < opts.connections) opts.connections = opts.overallRate;
            clients = [];
            initialiseClients(clients);
            interval.reschedule(1e3);
            tracker.emit("start");
          };
          setImmediate(() => {
            if (opts.forever && restart && isMainThread) restartFn();
          });
        }
      }
      function initialiseClients(clients2) {
        for (let i = 0; i < opts.connections; i++) {
          const url = urls[i % urls.length];
          if (!amount && !opts.maxConnectionRequests && opts.maxOverallRequests) {
            url.responseMax = distributeNums(opts.maxOverallRequests, i);
          }
          if (amount) {
            url.responseMax = distributeNums(amount, i);
            if (url.responseMax === 0) {
              throw Error("connections cannot be greater than amount");
            }
          }
          if (!opts.connectionRate && opts.overallRate) {
            url.rate = distributeNums(opts.overallRate, i);
          }
          if (opts.initialContext) {
            url.initialContext = opts.initialContext;
          }
          if (opts.tlsOptions) {
            url.tlsOptions = opts.tlsOptions;
          }
          const client = new Client(url);
          client.on("response", onResponse);
          client.on("connError", onError);
          client.on("mismatch", onExpectMismatch);
          client.on("reset", () => {
            resets++;
          });
          client.on("timeout", onTimeout);
          client.on("request", () => {
            totalRequests++;
          });
          client.on("done", onDone);
          clients2.push(client);
          totalRequests += url.pipelining < url.rate ? url.rate : url.pipelining;
        }
        function distributeNums(x, i) {
          return Math.floor(x / opts.connections) + (i + 1 <= x % opts.connections ? 1 : 0);
        }
        function onResponse(statusCode, resBytes, responseTime, rate) {
          tracker.emit("response", this, statusCode, resBytes, responseTime);
          const codeIndex = Math.floor(parseInt(statusCode) / 100) - 1;
          statusCodes[codeIndex] += 1;
          if (!statusCodeStats[statusCode]) {
            statusCodeStats[statusCode] = { count: 1 };
          } else {
            statusCodeStats[statusCode].count++;
          }
          if (codeIndex === 1 || includeErrorStats) {
            if (rate && !opts.ignoreCoordinatedOmission) {
              latencies.recordValueWithExpectedInterval(responseTime, Math.ceil(1 / rate));
            } else {
              latencies.recordValue(responseTime);
            }
          }
          if (codeIndex === 1 || includeErrorStats) bytes += resBytes;
          counter++;
        }
        function onError(error) {
          for (let i = 0; i < opts.pipelining; i++) tracker.emit("reqError", error);
          errors++;
          if (opts.debug) console.error(error);
          if (opts.bailout && errors >= opts.bailout) stop = true;
        }
        function onExpectMismatch(bpdyStr) {
          for (let i = 0; i < opts.pipelining; i++) {
            tracker.emit("reqMismatch", bpdyStr);
          }
          mismatches++;
          if (opts.bailout && mismatches >= opts.bailout) stop = true;
        }
        function onTimeout() {
          const error = new Error("request timed out");
          for (let i = 0; i < opts.pipelining; i++) tracker.emit("reqError", error);
          errors++;
          timeouts++;
          if (opts.bailout && errors >= opts.bailout) stop = true;
        }
        function onDone() {
          if (!--numRunning) stop = true;
        }
      }
      tracker.stop = () => {
        stop = true;
        restart = false;
      };
      return tracker;
    }
    module2.exports = run;
  }
});

// node_modules/autocannon/lib/runTracker.js
var require_runTracker = __commonJS({
  "node_modules/autocannon/lib/runTracker.js"(exports2, module2) {
    "use strict";
    var EE = require("events").EventEmitter;
    var run = require_run();
    var noop = require_noop();
    function runTracker(opts, tracker, cb) {
      cb = cb || noop;
      tracker = tracker || new EE();
      run(opts, tracker, cb);
      return tracker;
    }
    module2.exports = runTracker;
  }
});

// node_modules/progress/lib/node-progress.js
var require_node_progress = __commonJS({
  "node_modules/progress/lib/node-progress.js"(exports2, module2) {
    exports2 = module2.exports = ProgressBar;
    function ProgressBar(fmt, options) {
      this.stream = options.stream || process.stderr;
      if (typeof options == "number") {
        var total = options;
        options = {};
        options.total = total;
      } else {
        options = options || {};
        if ("string" != typeof fmt) throw new Error("format required");
        if ("number" != typeof options.total) throw new Error("total required");
      }
      this.fmt = fmt;
      this.curr = options.curr || 0;
      this.total = options.total;
      this.width = options.width || this.total;
      this.clear = options.clear;
      this.chars = {
        complete: options.complete || "=",
        incomplete: options.incomplete || "-",
        head: options.head || (options.complete || "=")
      };
      this.renderThrottle = options.renderThrottle !== 0 ? options.renderThrottle || 16 : 0;
      this.lastRender = -Infinity;
      this.callback = options.callback || function() {
      };
      this.tokens = {};
      this.lastDraw = "";
    }
    ProgressBar.prototype.tick = function(len, tokens) {
      if (len !== 0)
        len = len || 1;
      if ("object" == typeof len) tokens = len, len = 1;
      if (tokens) this.tokens = tokens;
      if (0 == this.curr) this.start = /* @__PURE__ */ new Date();
      this.curr += len;
      this.render();
      if (this.curr >= this.total) {
        this.render(void 0, true);
        this.complete = true;
        this.terminate();
        this.callback(this);
        return;
      }
    };
    ProgressBar.prototype.render = function(tokens, force) {
      force = force !== void 0 ? force : false;
      if (tokens) this.tokens = tokens;
      if (!this.stream.isTTY) return;
      var now = Date.now();
      var delta = now - this.lastRender;
      if (!force && delta < this.renderThrottle) {
        return;
      } else {
        this.lastRender = now;
      }
      var ratio = this.curr / this.total;
      ratio = Math.min(Math.max(ratio, 0), 1);
      var percent = Math.floor(ratio * 100);
      var incomplete, complete, completeLength;
      var elapsed = /* @__PURE__ */ new Date() - this.start;
      var eta = percent == 100 ? 0 : elapsed * (this.total / this.curr - 1);
      var rate = this.curr / (elapsed / 1e3);
      var str = this.fmt.replace(":current", this.curr).replace(":total", this.total).replace(":elapsed", isNaN(elapsed) ? "0.0" : (elapsed / 1e3).toFixed(1)).replace(":eta", isNaN(eta) || !isFinite(eta) ? "0.0" : (eta / 1e3).toFixed(1)).replace(":percent", percent.toFixed(0) + "%").replace(":rate", Math.round(rate));
      var availableSpace = Math.max(0, this.stream.columns - str.replace(":bar", "").length);
      if (availableSpace && process.platform === "win32") {
        availableSpace = availableSpace - 1;
      }
      var width = Math.min(this.width, availableSpace);
      completeLength = Math.round(width * ratio);
      complete = Array(Math.max(0, completeLength + 1)).join(this.chars.complete);
      incomplete = Array(Math.max(0, width - completeLength + 1)).join(this.chars.incomplete);
      if (completeLength > 0)
        complete = complete.slice(0, -1) + this.chars.head;
      str = str.replace(":bar", complete + incomplete);
      if (this.tokens) for (var key in this.tokens) str = str.replace(":" + key, this.tokens[key]);
      if (this.lastDraw !== str) {
        this.stream.cursorTo(0);
        this.stream.write(str);
        this.stream.clearLine(1);
        this.lastDraw = str;
      }
    };
    ProgressBar.prototype.update = function(ratio, tokens) {
      var goal = Math.floor(ratio * this.total);
      var delta = goal - this.curr;
      this.tick(delta, tokens);
    };
    ProgressBar.prototype.interrupt = function(message) {
      this.stream.clearLine();
      this.stream.cursorTo(0);
      this.stream.write(message);
      this.stream.write("\n");
      this.stream.write(this.lastDraw);
    };
    ProgressBar.prototype.terminate = function() {
      if (this.clear) {
        if (this.stream.clearLine) {
          this.stream.clearLine();
          this.stream.cursorTo(0);
        }
      } else {
        this.stream.write("\n");
      }
    };
  }
});

// node_modules/progress/index.js
var require_progress = __commonJS({
  "node_modules/progress/index.js"(exports2, module2) {
    module2.exports = require_node_progress();
  }
});

// node_modules/char-spinner/spin.js
var require_spin = __commonJS({
  "node_modules/char-spinner/spin.js"(exports2, module2) {
    module2.exports = spinner;
    function spinner(opt) {
      opt = opt || {};
      var str = opt.stream || process.stderr;
      var tty = typeof opt.tty === "boolean" ? opt.tty : true;
      var string = opt.string || "/-\\|";
      var ms = typeof opt.interval === "number" ? opt.interval : 50;
      if (ms < 0) ms = 0;
      if (tty && !str.isTTY) return false;
      var CR = str.isTTY ? "\x1B[0G" : "\r";
      var CLEAR = str.isTTY ? "\x1B[2K" : "\r \r";
      var s = 0;
      var sprite = string.split("");
      var wrote = false;
      var delay = typeof opt.delay === "number" ? opt.delay : 2;
      var interval = setInterval(function() {
        if (--delay >= 0) return;
        s = ++s % sprite.length;
        var c = sprite[s];
        str.write(c + CR);
        wrote = true;
      }, ms);
      var unref = typeof opt.unref === "boolean" ? opt.unref : true;
      if (unref && typeof interval.unref === "function") {
        interval.unref();
      }
      var cleanup = typeof opt.cleanup === "boolean" ? opt.cleanup : true;
      if (cleanup) {
        process.on("exit", function() {
          if (wrote) {
            str.write(CLEAR);
          }
        });
      }
      module2.exports.clear = function() {
        str.write(CLEAR);
      };
      return interval;
    }
    module2.exports.clear = function() {
    };
  }
});

// node_modules/autocannon/lib/progressTracker.js
var require_progressTracker = __commonJS({
  "node_modules/autocannon/lib/progressTracker.js"(exports2, module2) {
    "use strict";
    var ProgressBar = require_progress();
    var Chalk = require_source();
    var testColorSupport = require_color_support();
    var charSpinner = require_spin();
    var printResult2 = require_printResult();
    var { isMainThread } = require_worker_threads();
    var defaults2 = {
      // use stderr as its progressBar's default
      outputStream: process.stderr,
      renderProgressBar: true,
      renderResultsTable: true,
      renderLatencyTable: false
    };
    function track2(instance, opts) {
      if (!instance) {
        throw new Error("instance required for tracking");
      }
      opts = Object.assign({}, defaults2, opts);
      const chalk = new Chalk.Instance(testColorSupport({ stream: opts.outputStream, alwaysReturn: true }));
      const runningDescription = opts.warmupRunning ? "warmup" : "running";
      opts.progressBarString = opts.progressBarString || `${chalk.green(runningDescription)} [:bar] :percent`;
      const iOpts = instance.opts;
      let durationProgressBar;
      let amountProgressBar;
      let addedListeners = false;
      let spinner;
      instance.on("start", () => {
        if (opts.renderProgressBar && isMainThread) {
          const socketPath = iOpts.socketPath ? ` (${iOpts.socketPath})` : "";
          let msg = `${iOpts.connections} connections`;
          if (iOpts.pipelining > 1) {
            msg += ` with ${iOpts.pipelining} pipelining factor`;
          }
          if (iOpts.workers) {
            msg += `
${iOpts.workers} workers`;
          }
          const runningType = opts.warmupRunning ? "warmup" : "test";
          const message = iOpts.amount ? `Running ${iOpts.amount} requests ${runningType} @ ${iOpts.url}${socketPath}
${msg}
` : `Running ${iOpts.duration}s ${runningType} @ ${iOpts.url}${socketPath}
${msg}
`;
          logToStream(message);
          if (iOpts.workers) {
            showSpinner();
          } else {
            if (iOpts.amount) {
              amountProgressBar = trackAmount(instance, opts, iOpts);
            } else {
              durationProgressBar = trackDuration(instance, opts, iOpts);
            }
          }
          addListener();
        }
      });
      instance.on("done", (result) => {
        if (opts.renderResultsTable === false) return;
        const tableStrResult = printResult2(result, opts);
        opts.outputStream.write(tableStrResult);
      });
      function showSpinner() {
        spinner = charSpinner();
      }
      function hideSpinner() {
        if (spinner) {
          clearInterval(spinner);
          spinner = null;
        }
      }
      function addListener() {
        if (addedListeners) {
          return;
        }
        addedListeners = true;
        if (iOpts.workers) {
          instance.prependOnceListener("done", hideSpinner);
          return;
        }
        if (opts.outputStream.isTTY) {
          if (!iOpts.amount) {
            instance.on("tick", () => {
              durationProgressBar.tick();
            });
            instance.on("done", () => {
              durationProgressBar.tick(iOpts.duration - 1);
            });
            process.once("SIGINT", () => {
              durationProgressBar.tick(iOpts.duration - 1);
            });
          } else {
            instance.on("response", () => {
              amountProgressBar.tick();
            });
            instance.on("reqError", () => {
              amountProgressBar.tick();
            });
            instance.on("done", () => {
              amountProgressBar.tick(iOpts.amount - 1);
            });
            process.once("SIGINT", () => {
              amountProgressBar.tick(iOpts.amount - 1);
            });
          }
        }
      }
      function logToStream(msg) {
        if (!isMainThread) return;
        opts.outputStream.write(msg + "\n");
      }
    }
    function trackDuration(instance, opts, iOpts) {
      if (!opts.outputStream.isTTY) return;
      const progressBar = new ProgressBar(opts.progressBarString, {
        width: 20,
        incomplete: " ",
        total: iOpts.duration,
        clear: true,
        stream: opts.outputStream
      });
      progressBar.tick(0);
      return progressBar;
    }
    function trackAmount(instance, opts, iOpts) {
      if (!opts.outputStream.isTTY) return;
      const progressBar = new ProgressBar(opts.progressBarString, {
        width: 20,
        incomplete: " ",
        total: iOpts.amount,
        clear: true,
        stream: opts.outputStream
      });
      progressBar.tick(0);
      return progressBar;
    }
    module2.exports = track2;
  }
});

// node_modules/autocannon/lib/init.js
var require_init = __commonJS({
  "node_modules/autocannon/lib/init.js"(exports2, module2) {
    "use strict";
    var EE = require("events").EventEmitter;
    var { isMainThread } = require_worker_threads();
    var initWorkers = require_manager();
    var validateOpts2 = require_validate();
    var noop = require_noop();
    var runTracker = require_runTracker();
    var track2 = require_progressTracker();
    function init(opts, cb) {
      const cbPassedIn = typeof cb === "function";
      if (!cbPassedIn && !opts.forever) {
        if (opts.warmup) {
          return runWithWarmup(opts);
        } else {
          return run(opts);
        }
      } else {
        return _init(opts, null, cb);
      }
    }
    function run(opts) {
      const tracker = new EE();
      const promise = new Promise((resolve, reject) => {
        _init(opts, tracker, (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });
      tracker.then = promise.then.bind(promise);
      tracker.catch = promise.catch.bind(promise);
      return tracker;
    }
    function runWithWarmup(opts) {
      const warmupOpts = {
        ...opts,
        ...opts.warmup,
        warmupRunning: true,
        renderResultsTable: false
      };
      const mainTracker = new EE();
      const warmUpTracker = new EE();
      const promise = new Promise((resolve, reject) => {
        _init(warmupOpts, warmUpTracker, (err, warmupResults) => {
          if (err) return reject(err);
          _init(opts, mainTracker, (err2, results) => {
            if (err2) return reject(err2);
            results.warmup = warmupResults;
            resolve(results);
          });
        });
      });
      mainTracker.then = promise.then.bind(promise);
      mainTracker.catch = promise.catch.bind(promise);
      return mainTracker;
    }
    function _init(opts, tracker, cb) {
      const cbPassedIn = typeof cb === "function";
      cb = cb || noop;
      tracker = tracker || new EE();
      opts = validateOpts2(opts, cbPassedIn);
      function _cb(err, result) {
        if (err) {
          return cbPassedIn ? cb(err) : setImmediate(() => tracker.emit("error", err));
        }
        tracker.emit("done", result);
        cb(null, result);
        if (!err && opts.json) {
          console.log(JSON.stringify(result));
        }
      }
      if (opts instanceof Error) {
        _cb(opts);
        return tracker;
      }
      tracker.opts = opts;
      if (opts.workers && isMainThread) {
        initWorkers(opts, tracker, _cb);
      } else {
        runTracker(opts, tracker, _cb);
      }
      if (opts[/* @__PURE__ */ Symbol.for("internal")] && (!opts.json || !process.stdout.isTTY)) track2(tracker, opts);
      return tracker;
    }
    module2.exports = init;
  }
});

// node_modules/autocannon/lib/subargAliases.js
var require_subargAliases = __commonJS({
  "node_modules/autocannon/lib/subargAliases.js"(exports2, module2) {
    "use strict";
    var clone = require_lodash();
    var subArgAlias = {
      warmup: {
        c: "connections",
        d: "duration"
      }
    };
    function generateSubargAliases(args) {
      const aliasedArgs = clone(args);
      function isParentAliasInArgs(argKey) {
        return aliasedArgs[argKey];
      }
      function isSubargAnAlias(parentAlias, subArg) {
        return parentAlias[subArg];
      }
      function mapAliasForSubarg(parentAlias, parentKey) {
        const parentArgs = aliasedArgs[parentKey];
        for (const subArg in parentArgs) {
          if (isSubargAnAlias(parentAlias, subArg)) {
            parentArgs[parentAlias[subArg]] = parentArgs[subArg];
          }
        }
      }
      for (const parentKey in subArgAlias) {
        const parentAlias = subArgAlias[parentKey];
        if (isParentAliasInArgs(parentKey)) {
          mapAliasForSubarg(parentAlias, parentKey);
        }
      }
      return aliasedArgs;
    }
    module2.exports = generateSubargAliases;
  }
});

// node_modules/autocannon/package.json
var require_package = __commonJS({
  "node_modules/autocannon/package.json"(exports2, module2) {
    module2.exports = {
      name: "autocannon",
      version: "7.15.0",
      description: "Fast HTTP benchmarking tool written in Node.js",
      main: "autocannon.js",
      bin: {
        autocannon: "autocannon.js"
      },
      scripts: {
        test: "standard && tap test/serial/*.test.js test/*.test.js",
        "standard:fix": "standard --fix"
      },
      "pre-commit": [
        "test"
      ],
      repository: {
        type: "git",
        url: "git+https://github.com/mcollina/autocannon.git"
      },
      keywords: [
        "http",
        "soak",
        "load",
        "fast",
        "wrk",
        "ab",
        "test"
      ],
      author: "Matteo Collina <hello@matteocollina.com>",
      contributors: [
        "Glen Keane <glenkeane.94@gmail.com>",
        "Donald Robertson <donaldarobertson89@gmail.com",
        "Salman Mitha <SalmanMitha@gmail.com"
      ],
      license: "MIT",
      bugs: {
        url: "https://github.com/mcollina/autocannon/issues"
      },
      homepage: "https://github.com/mcollina/autocannon#readme",
      devDependencies: {
        bl: "^6.0.0",
        busboy: "^0.3.1",
        "pre-commit": "^1.1.2",
        proxyquire: "^2.1.3",
        sinon: "^15.0.0",
        split2: "^4.0.0",
        standard: "^17.0.0",
        tap: "^16.0.0"
      },
      dependencies: {
        chalk: "^4.1.0",
        "char-spinner": "^1.0.1",
        "cli-table3": "^0.6.0",
        "color-support": "^1.1.1",
        "cross-argv": "^2.0.0",
        "form-data": "^4.0.0",
        "has-async-hooks": "^1.0.0",
        "hdr-histogram-js": "^3.0.0",
        "hdr-histogram-percentiles-obj": "^3.0.0",
        "http-parser-js": "^0.5.2",
        hyperid: "^3.0.0",
        "lodash.chunk": "^4.2.0",
        "lodash.clonedeep": "^4.5.0",
        "lodash.flatten": "^4.4.0",
        "manage-path": "^2.0.0",
        "on-net-listen": "^1.1.1",
        "pretty-bytes": "^5.4.1",
        progress: "^2.0.3",
        reinterval: "^1.1.0",
        retimer: "^3.0.0",
        semver: "^7.3.2",
        subarg: "^1.0.0",
        timestring: "^6.0.0"
      }
    };
  }
});

// node_modules/autocannon/autocannon.js
var crossArgv = require_cross_argv();
var fs = require("fs");
var os = require("os");
var net = require("net");
var path = require("path");
var URL2 = require("url").URL;
var spawn = require("child_process").spawn;
var managePath = require_dist();
var hasAsyncHooks = require_has_async_hooks();
var subarg = require_subarg();
var printResult = require_printResult();
var initJob = require_init();
var track = require_progressTracker();
var generateSubArgAliases = require_subargAliases();
var { checkURL, ofURL } = require_url();
var { parseHAR } = require_parseHAR();
var _aggregateResult = require_aggregateResult();
var validateOpts = require_validate();
if (typeof URL2 !== "function") {
  console.error("autocannon requires the WHATWG URL API, but it is not available. Please upgrade to Node 6.13+.");
  process.exit(1);
}
module.exports = initJob;
module.exports.track = track;
module.exports.start = start;
module.exports.printResult = printResult;
module.exports.parseArguments = parseArguments;
module.exports.aggregateResult = function aggregateResult(results, opts = {}) {
  if (!Array.isArray(results)) {
    throw new Error('"results" must be an array of results');
  }
  opts = validateOpts(opts, false);
  if (opts instanceof Error) {
    throw opts;
  }
  return _aggregateResult(results, opts);
};
var alias = {
  connections: "c",
  pipelining: "p",
  timeout: "t",
  duration: "d",
  sampleInt: "L",
  amount: "a",
  json: "j",
  renderLatencyTable: ["l", "latency"],
  onPort: "on-port",
  method: "m",
  headers: ["H", "header"],
  body: "b",
  form: "F",
  servername: "s",
  bailout: "B",
  input: "i",
  maxConnectionRequests: "M",
  maxOverallRequests: "O",
  connectionRate: "r",
  overallRate: "R",
  ignoreCoordinatedOmission: "C",
  reconnectRate: "D",
  renderProgressBar: "progress",
  renderStatusCodes: "statusCodes",
  title: "T",
  verbose: "V",
  version: "v",
  forever: "f",
  idReplacement: "I",
  socketPath: "S",
  excludeErrorStats: "x",
  expectBody: "E",
  workers: "w",
  warmup: "W",
  help: "h"
};
var defaults = {
  connections: 10,
  timeout: 10,
  pipelining: 1,
  duration: 10,
  sampleInt: 1e3,
  reconnectRate: 0,
  renderLatencyTable: false,
  renderProgressBar: true,
  renderStatusCodes: false,
  json: false,
  forever: false,
  method: "GET",
  idReplacement: false,
  excludeErrorStats: false,
  debug: false,
  workers: 0,
  verbose: true
};
function parseArguments(argvs) {
  let argv = subarg(argvs, {
    boolean: ["json", "n", "help", "renderLatencyTable", "renderProgressBar", "renderStatusCodes", "forever", "idReplacement", "excludeErrorStats", "onPort", "debug", "ignoreCoordinatedOmission", "verbose"],
    alias,
    default: defaults,
    "--": true
  });
  argv = generateSubArgAliases(argv);
  argv.url = argv._.length > 1 ? argv._ : argv._[0];
  if (argv.onPort) {
    argv.spawn = argv["--"];
  }
  if (argv.n) {
    argv.renderProgressBar = false;
    argv.renderResultsTable = false;
    argv.renderStatusCodes = false;
  }
  if (argv.version) {
    console.log("autocannon", "v" + require_package().version);
    console.log("node", process.version);
    return;
  }
  if (!checkURL(argv.url) || argv.help) {
    const help = fs.readFileSync(path.join(__dirname, "help.txt"), "utf8");
    console.error(help);
    return;
  }
  if (process.env.PORT) {
    argv.url = ofURL(argv.url).map((url) => new URL2(url, `http://localhost:${process.env.PORT}`).href);
  }
  argv.url = ofURL(argv.url).map((url) => {
    if (url.indexOf("http") !== 0 && url[0] !== "/") {
      url = `http://${url}`;
    }
    return url;
  });
  ofURL(argv.url).map((url) => {
    try {
      if (argv.onPort) {
        new URL2(url, "http://localhost");
      } else {
        new URL2(url);
      }
    } catch (err) {
      console.error(err.message);
      console.error("");
      console.error("When targeting a path without a hostname, the PORT environment variable must be available.");
      console.error("Use a full URL or set the PORT variable.");
      process.exit(1);
    }
    return null;
  });
  if (argv.input) {
    argv.body = fs.readFileSync(argv.input, "utf8");
  }
  if (argv.headers) {
    if (!Array.isArray(argv.headers)) {
      argv.headers = [argv.headers];
    }
    argv.headers = argv.headers.reduce((obj, header) => {
      const colonIndex = header.indexOf(":");
      const equalIndex = header.indexOf("=");
      const index = Math.min(colonIndex < 0 ? Infinity : colonIndex, equalIndex < 0 ? Infinity : equalIndex);
      if (Number.isFinite(index) && index > 0) {
        obj[header.slice(0, index)] = header.slice(index + 1);
        return obj;
      } else throw new Error(`An HTTP header was not correctly formatted: ${header}`);
    }, {});
  }
  if (argv.har) {
    try {
      argv.har = JSON.parse(fs.readFileSync(argv.har));
      const requestsByOrigin = parseHAR(argv.har);
      const allowed = ofURL(argv.url, true).map((url) => new URL2(url).origin);
      for (const [origin] of requestsByOrigin) {
        if (!allowed.includes(origin)) {
          console.error(`Warning: skipping requests to '${origin}' as the target is ${allowed.join(", ")}`);
        }
      }
    } catch (err) {
      throw new Error(`Failed to load HAR file content: ${err.message}`);
    }
  }
  argv.tlsOptions = {};
  if (argv.cert) {
    try {
      argv.tlsOptions.cert = fs.readFileSync(argv.cert);
    } catch (err) {
      throw new Error(`Failed to load cert file: ${err.message}`);
    }
  }
  if (argv.key) {
    try {
      argv.tlsOptions.key = fs.readFileSync(argv.key);
    } catch (err) {
      throw new Error(`Failed to load key file: ${err.message}`);
    }
  }
  if (argv.ca) {
    if (typeof argv.ca === "string") {
      argv.ca = [argv.ca];
    } else if (Array.isArray(argv.ca._)) {
      argv.ca = argv.ca._;
    }
    try {
      argv.tlsOptions.ca = argv.ca.map((caPath) => fs.readFileSync(caPath));
    } catch (err) {
      throw new Error(`Failed to load ca file: ${err.message}`);
    }
  }
  argv[/* @__PURE__ */ Symbol.for("internal")] = true;
  return argv;
}
function start(argv) {
  if (!argv) {
    return;
  }
  if (argv.onPort) {
    if (!hasAsyncHooks()) {
      console.error("The --on-port flag requires the async_hooks builtin module, but it is not available. Please upgrade to Node 8.1+.");
      process.exit(1);
    }
    const { socketPath, server } = createChannel((port) => {
      const url = new URL2(argv.url, `http://localhost:${port}`).href;
      const opts = Object.assign({}, argv, {
        onPort: false,
        url
      });
      const tracker = initJob(opts, () => {
        proc.kill("SIGINT");
        server.close();
      });
      process.once("SIGINT", () => {
        tracker.stop();
      });
    });
    const alterPath = managePath({ PATH: process.env.NODE_PATH });
    alterPath.unshift(path.join(__dirname, "lib/preload"));
    const proc = spawn(argv.spawn[0], argv.spawn.slice(1), {
      stdio: ["ignore", "inherit", "inherit"],
      env: Object.assign({}, process.env, {
        NODE_OPTIONS: ["-r", "autocannonDetectPort"].join(" ") + (process.env.NODE_OPTIONS ? ` ${process.env.NODE_OPTIONS}` : ""),
        NODE_PATH: alterPath.get(),
        AUTOCANNON_SOCKET: socketPath
      })
    });
  } else {
    try {
      const tracker = initJob(argv);
      if (tracker.then) {
        tracker.catch((err) => {
          console.error(err.message);
        });
      }
    } catch (err) {
      console.error(err.message);
    }
  }
}
function createChannel(onport) {
  const pipeName = `${process.pid}.autocannon`;
  const socketPath = process.platform === "win32" ? `\\\\?\\pipe\\${pipeName}` : path.join(os.tmpdir(), pipeName);
  const server = net.createServer((socket) => {
    socket.once("data", (chunk) => {
      const port = chunk.toString();
      onport(port);
    });
  });
  server.listen(socketPath);
  server.on("close", () => {
    try {
      fs.unlinkSync(socketPath);
    } catch (err) {
    }
  });
  return { socketPath, server };
}
if (require.main === module) {
  const argv = crossArgv(process.argv.slice(2));
  start(parseArguments(argv));
}
/*! Bundled license information:

mime-db/index.js:
  (*!
   * mime-db
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2015-2022 Douglas Christopher Wilson
   * MIT Licensed
   *)

mime-types/index.js:
  (*!
   * mime-types
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   *)

ieee754/index.js:
  (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)

buffer/index.js:
  (*!
   * The buffer module from node.js, for the browser.
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   *)

progress/lib/node-progress.js:
  (*!
   * node-progress
   * Copyright(c) 2011 TJ Holowaychuk <tj@vision-media.ca>
   * MIT Licensed
   *)
*/
