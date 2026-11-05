#!/usr/bin/env node
"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// node_modules/js-yaml/lib/common.js
var require_common = __commonJS({
  "node_modules/js-yaml/lib/common.js"(exports2, module2) {
    "use strict";
    function isNothing(subject) {
      return typeof subject === "undefined" || subject === null;
    }
    function isObject(subject) {
      return typeof subject === "object" && subject !== null;
    }
    function toArray(sequence) {
      if (Array.isArray(sequence)) return sequence;
      else if (isNothing(sequence)) return [];
      return [sequence];
    }
    function extend(target, source) {
      var index, length, key, sourceKeys;
      if (source) {
        sourceKeys = Object.keys(source);
        for (index = 0, length = sourceKeys.length; index < length; index += 1) {
          key = sourceKeys[index];
          target[key] = source[key];
        }
      }
      return target;
    }
    function repeat(string, count) {
      var result = "", cycle;
      for (cycle = 0; cycle < count; cycle += 1) {
        result += string;
      }
      return result;
    }
    function isNegativeZero(number) {
      return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
    }
    module2.exports.isNothing = isNothing;
    module2.exports.isObject = isObject;
    module2.exports.toArray = toArray;
    module2.exports.repeat = repeat;
    module2.exports.isNegativeZero = isNegativeZero;
    module2.exports.extend = extend;
  }
});

// node_modules/js-yaml/lib/exception.js
var require_exception = __commonJS({
  "node_modules/js-yaml/lib/exception.js"(exports2, module2) {
    "use strict";
    function formatError(exception, compact) {
      var where = "", message = exception.reason || "(unknown reason)";
      if (!exception.mark) return message;
      if (exception.mark.name) {
        where += 'in "' + exception.mark.name + '" ';
      }
      where += "(" + (exception.mark.line + 1) + ":" + (exception.mark.column + 1) + ")";
      if (!compact && exception.mark.snippet) {
        where += "\n\n" + exception.mark.snippet;
      }
      return message + " " + where;
    }
    function YAMLException(reason, mark) {
      Error.call(this);
      this.name = "YAMLException";
      this.reason = reason;
      this.mark = mark;
      this.message = formatError(this, false);
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
      } else {
        this.stack = new Error().stack || "";
      }
    }
    YAMLException.prototype = Object.create(Error.prototype);
    YAMLException.prototype.constructor = YAMLException;
    YAMLException.prototype.toString = function toString(compact) {
      return this.name + ": " + formatError(this, compact);
    };
    module2.exports = YAMLException;
  }
});

// node_modules/js-yaml/lib/snippet.js
var require_snippet = __commonJS({
  "node_modules/js-yaml/lib/snippet.js"(exports2, module2) {
    "use strict";
    var common = require_common();
    function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
      var head = "";
      var tail = "";
      var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
      if (position - lineStart > maxHalfLength) {
        head = " ... ";
        lineStart = position - maxHalfLength + head.length;
      }
      if (lineEnd - position > maxHalfLength) {
        tail = " ...";
        lineEnd = position + maxHalfLength - tail.length;
      }
      return {
        str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
        pos: position - lineStart + head.length
        // relative position
      };
    }
    function padStart(string, max) {
      return common.repeat(" ", max - string.length) + string;
    }
    function makeSnippet(mark, options) {
      options = Object.create(options || null);
      if (!mark.buffer) return null;
      if (!options.maxLength) options.maxLength = 79;
      if (typeof options.indent !== "number") options.indent = 1;
      if (typeof options.linesBefore !== "number") options.linesBefore = 3;
      if (typeof options.linesAfter !== "number") options.linesAfter = 2;
      var re = /\r?\n|\r|\0/g;
      var lineStarts = [0];
      var lineEnds = [];
      var match;
      var foundLineNo = -1;
      while (match = re.exec(mark.buffer)) {
        lineEnds.push(match.index);
        lineStarts.push(match.index + match[0].length);
        if (mark.position <= match.index && foundLineNo < 0) {
          foundLineNo = lineStarts.length - 2;
        }
      }
      if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
      var result = "", i, line;
      var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
      var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
      for (i = 1; i <= options.linesBefore; i++) {
        if (foundLineNo - i < 0) break;
        line = getLine(
          mark.buffer,
          lineStarts[foundLineNo - i],
          lineEnds[foundLineNo - i],
          mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
          maxLineLength
        );
        result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
      }
      line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
      result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
      result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
      for (i = 1; i <= options.linesAfter; i++) {
        if (foundLineNo + i >= lineEnds.length) break;
        line = getLine(
          mark.buffer,
          lineStarts[foundLineNo + i],
          lineEnds[foundLineNo + i],
          mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
          maxLineLength
        );
        result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
      }
      return result.replace(/\n$/, "");
    }
    module2.exports = makeSnippet;
  }
});

// node_modules/js-yaml/lib/type.js
var require_type = __commonJS({
  "node_modules/js-yaml/lib/type.js"(exports2, module2) {
    "use strict";
    var YAMLException = require_exception();
    var TYPE_CONSTRUCTOR_OPTIONS = [
      "kind",
      "multi",
      "resolve",
      "construct",
      "instanceOf",
      "predicate",
      "represent",
      "representName",
      "defaultStyle",
      "styleAliases"
    ];
    var YAML_NODE_KINDS = [
      "scalar",
      "sequence",
      "mapping"
    ];
    function compileStyleAliases(map) {
      var result = {};
      if (map !== null) {
        Object.keys(map).forEach(function(style) {
          map[style].forEach(function(alias) {
            result[String(alias)] = style;
          });
        });
      }
      return result;
    }
    function Type(tag, options) {
      options = options || {};
      Object.keys(options).forEach(function(name) {
        if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
          throw new YAMLException('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
        }
      });
      this.options = options;
      this.tag = tag;
      this.kind = options["kind"] || null;
      this.resolve = options["resolve"] || function() {
        return true;
      };
      this.construct = options["construct"] || function(data) {
        return data;
      };
      this.instanceOf = options["instanceOf"] || null;
      this.predicate = options["predicate"] || null;
      this.represent = options["represent"] || null;
      this.representName = options["representName"] || null;
      this.defaultStyle = options["defaultStyle"] || null;
      this.multi = options["multi"] || false;
      this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
      if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
        throw new YAMLException('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
      }
    }
    module2.exports = Type;
  }
});

// node_modules/js-yaml/lib/schema.js
var require_schema = __commonJS({
  "node_modules/js-yaml/lib/schema.js"(exports2, module2) {
    "use strict";
    var YAMLException = require_exception();
    var Type = require_type();
    function compileList(schema, name) {
      var result = [];
      schema[name].forEach(function(currentType) {
        var newIndex = result.length;
        result.forEach(function(previousType, previousIndex) {
          if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
            newIndex = previousIndex;
          }
        });
        result[newIndex] = currentType;
      });
      return result;
    }
    function compileMap() {
      var result = {
        scalar: {},
        sequence: {},
        mapping: {},
        fallback: {},
        multi: {
          scalar: [],
          sequence: [],
          mapping: [],
          fallback: []
        }
      }, index, length;
      function collectType(type) {
        if (type.multi) {
          result.multi[type.kind].push(type);
          result.multi["fallback"].push(type);
        } else {
          result[type.kind][type.tag] = result["fallback"][type.tag] = type;
        }
      }
      for (index = 0, length = arguments.length; index < length; index += 1) {
        arguments[index].forEach(collectType);
      }
      return result;
    }
    function Schema(definition) {
      return this.extend(definition);
    }
    Schema.prototype.extend = function extend(definition) {
      var implicit = [];
      var explicit = [];
      if (definition instanceof Type) {
        explicit.push(definition);
      } else if (Array.isArray(definition)) {
        explicit = explicit.concat(definition);
      } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
        if (definition.implicit) implicit = implicit.concat(definition.implicit);
        if (definition.explicit) explicit = explicit.concat(definition.explicit);
      } else {
        throw new YAMLException("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
      }
      implicit.forEach(function(type) {
        if (!(type instanceof Type)) {
          throw new YAMLException("Specified list of YAML types (or a single Type object) contains a non-Type object.");
        }
        if (type.loadKind && type.loadKind !== "scalar") {
          throw new YAMLException("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
        }
        if (type.multi) {
          throw new YAMLException("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
        }
      });
      explicit.forEach(function(type) {
        if (!(type instanceof Type)) {
          throw new YAMLException("Specified list of YAML types (or a single Type object) contains a non-Type object.");
        }
      });
      var result = Object.create(Schema.prototype);
      result.implicit = (this.implicit || []).concat(implicit);
      result.explicit = (this.explicit || []).concat(explicit);
      result.compiledImplicit = compileList(result, "implicit");
      result.compiledExplicit = compileList(result, "explicit");
      result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
      return result;
    };
    module2.exports = Schema;
  }
});

// node_modules/js-yaml/lib/type/str.js
var require_str = __commonJS({
  "node_modules/js-yaml/lib/type/str.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    module2.exports = new Type("tag:yaml.org,2002:str", {
      kind: "scalar",
      construct: function(data) {
        return data !== null ? data : "";
      }
    });
  }
});

// node_modules/js-yaml/lib/type/seq.js
var require_seq = __commonJS({
  "node_modules/js-yaml/lib/type/seq.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    module2.exports = new Type("tag:yaml.org,2002:seq", {
      kind: "sequence",
      construct: function(data) {
        return data !== null ? data : [];
      }
    });
  }
});

// node_modules/js-yaml/lib/type/map.js
var require_map = __commonJS({
  "node_modules/js-yaml/lib/type/map.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    module2.exports = new Type("tag:yaml.org,2002:map", {
      kind: "mapping",
      construct: function(data) {
        return data !== null ? data : {};
      }
    });
  }
});

// node_modules/js-yaml/lib/schema/failsafe.js
var require_failsafe = __commonJS({
  "node_modules/js-yaml/lib/schema/failsafe.js"(exports2, module2) {
    "use strict";
    var Schema = require_schema();
    module2.exports = new Schema({
      explicit: [
        require_str(),
        require_seq(),
        require_map()
      ]
    });
  }
});

// node_modules/js-yaml/lib/type/null.js
var require_null = __commonJS({
  "node_modules/js-yaml/lib/type/null.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    function resolveYamlNull(data) {
      if (data === null) return true;
      var max = data.length;
      return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
    }
    function constructYamlNull() {
      return null;
    }
    function isNull(object) {
      return object === null;
    }
    module2.exports = new Type("tag:yaml.org,2002:null", {
      kind: "scalar",
      resolve: resolveYamlNull,
      construct: constructYamlNull,
      predicate: isNull,
      represent: {
        canonical: function() {
          return "~";
        },
        lowercase: function() {
          return "null";
        },
        uppercase: function() {
          return "NULL";
        },
        camelcase: function() {
          return "Null";
        },
        empty: function() {
          return "";
        }
      },
      defaultStyle: "lowercase"
    });
  }
});

// node_modules/js-yaml/lib/type/bool.js
var require_bool = __commonJS({
  "node_modules/js-yaml/lib/type/bool.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    function resolveYamlBoolean(data) {
      if (data === null) return false;
      var max = data.length;
      return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
    }
    function constructYamlBoolean(data) {
      return data === "true" || data === "True" || data === "TRUE";
    }
    function isBoolean(object) {
      return Object.prototype.toString.call(object) === "[object Boolean]";
    }
    module2.exports = new Type("tag:yaml.org,2002:bool", {
      kind: "scalar",
      resolve: resolveYamlBoolean,
      construct: constructYamlBoolean,
      predicate: isBoolean,
      represent: {
        lowercase: function(object) {
          return object ? "true" : "false";
        },
        uppercase: function(object) {
          return object ? "TRUE" : "FALSE";
        },
        camelcase: function(object) {
          return object ? "True" : "False";
        }
      },
      defaultStyle: "lowercase"
    });
  }
});

// node_modules/js-yaml/lib/type/int.js
var require_int = __commonJS({
  "node_modules/js-yaml/lib/type/int.js"(exports2, module2) {
    "use strict";
    var common = require_common();
    var Type = require_type();
    function isHexCode(c) {
      return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
    }
    function isOctCode(c) {
      return 48 <= c && c <= 55;
    }
    function isDecCode(c) {
      return 48 <= c && c <= 57;
    }
    function resolveYamlInteger(data) {
      if (data === null) return false;
      var max = data.length, index = 0, hasDigits = false, ch;
      if (!max) return false;
      ch = data[index];
      if (ch === "-" || ch === "+") {
        ch = data[++index];
      }
      if (ch === "0") {
        if (index + 1 === max) return true;
        ch = data[++index];
        if (ch === "b") {
          index++;
          for (; index < max; index++) {
            ch = data[index];
            if (ch === "_") continue;
            if (ch !== "0" && ch !== "1") return false;
            hasDigits = true;
          }
          return hasDigits && ch !== "_";
        }
        if (ch === "x") {
          index++;
          for (; index < max; index++) {
            ch = data[index];
            if (ch === "_") continue;
            if (!isHexCode(data.charCodeAt(index))) return false;
            hasDigits = true;
          }
          return hasDigits && ch !== "_";
        }
        if (ch === "o") {
          index++;
          for (; index < max; index++) {
            ch = data[index];
            if (ch === "_") continue;
            if (!isOctCode(data.charCodeAt(index))) return false;
            hasDigits = true;
          }
          return hasDigits && ch !== "_";
        }
      }
      if (ch === "_") return false;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isDecCode(data.charCodeAt(index))) {
          return false;
        }
        hasDigits = true;
      }
      if (!hasDigits || ch === "_") return false;
      return true;
    }
    function constructYamlInteger(data) {
      var value = data, sign = 1, ch;
      if (value.indexOf("_") !== -1) {
        value = value.replace(/_/g, "");
      }
      ch = value[0];
      if (ch === "-" || ch === "+") {
        if (ch === "-") sign = -1;
        value = value.slice(1);
        ch = value[0];
      }
      if (value === "0") return 0;
      if (ch === "0") {
        if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
        if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
        if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
      }
      return sign * parseInt(value, 10);
    }
    function isInteger(object) {
      return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
    }
    module2.exports = new Type("tag:yaml.org,2002:int", {
      kind: "scalar",
      resolve: resolveYamlInteger,
      construct: constructYamlInteger,
      predicate: isInteger,
      represent: {
        binary: function(obj) {
          return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
        },
        octal: function(obj) {
          return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
        },
        decimal: function(obj) {
          return obj.toString(10);
        },
        /* eslint-disable max-len */
        hexadecimal: function(obj) {
          return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
        }
      },
      defaultStyle: "decimal",
      styleAliases: {
        binary: [2, "bin"],
        octal: [8, "oct"],
        decimal: [10, "dec"],
        hexadecimal: [16, "hex"]
      }
    });
  }
});

// node_modules/js-yaml/lib/type/float.js
var require_float = __commonJS({
  "node_modules/js-yaml/lib/type/float.js"(exports2, module2) {
    "use strict";
    var common = require_common();
    var Type = require_type();
    var YAML_FLOAT_PATTERN = new RegExp(
      // 2.5e4, 2.5 and integers
      "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
    );
    function resolveYamlFloat(data) {
      if (data === null) return false;
      if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
      // Probably should update regexp & check speed
      data[data.length - 1] === "_") {
        return false;
      }
      return true;
    }
    function constructYamlFloat(data) {
      var value, sign;
      value = data.replace(/_/g, "").toLowerCase();
      sign = value[0] === "-" ? -1 : 1;
      if ("+-".indexOf(value[0]) >= 0) {
        value = value.slice(1);
      }
      if (value === ".inf") {
        return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      } else if (value === ".nan") {
        return NaN;
      }
      return sign * parseFloat(value, 10);
    }
    var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
    function representYamlFloat(object, style) {
      var res;
      if (isNaN(object)) {
        switch (style) {
          case "lowercase":
            return ".nan";
          case "uppercase":
            return ".NAN";
          case "camelcase":
            return ".NaN";
        }
      } else if (Number.POSITIVE_INFINITY === object) {
        switch (style) {
          case "lowercase":
            return ".inf";
          case "uppercase":
            return ".INF";
          case "camelcase":
            return ".Inf";
        }
      } else if (Number.NEGATIVE_INFINITY === object) {
        switch (style) {
          case "lowercase":
            return "-.inf";
          case "uppercase":
            return "-.INF";
          case "camelcase":
            return "-.Inf";
        }
      } else if (common.isNegativeZero(object)) {
        return "-0.0";
      }
      res = object.toString(10);
      return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
    }
    function isFloat(object) {
      return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
    }
    module2.exports = new Type("tag:yaml.org,2002:float", {
      kind: "scalar",
      resolve: resolveYamlFloat,
      construct: constructYamlFloat,
      predicate: isFloat,
      represent: representYamlFloat,
      defaultStyle: "lowercase"
    });
  }
});

// node_modules/js-yaml/lib/schema/json.js
var require_json = __commonJS({
  "node_modules/js-yaml/lib/schema/json.js"(exports2, module2) {
    "use strict";
    module2.exports = require_failsafe().extend({
      implicit: [
        require_null(),
        require_bool(),
        require_int(),
        require_float()
      ]
    });
  }
});

// node_modules/js-yaml/lib/schema/core.js
var require_core = __commonJS({
  "node_modules/js-yaml/lib/schema/core.js"(exports2, module2) {
    "use strict";
    module2.exports = require_json();
  }
});

// node_modules/js-yaml/lib/type/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/js-yaml/lib/type/timestamp.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    var YAML_DATE_REGEXP = new RegExp(
      "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
    );
    var YAML_TIMESTAMP_REGEXP = new RegExp(
      "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
    );
    function resolveYamlTimestamp(data) {
      if (data === null) return false;
      if (YAML_DATE_REGEXP.exec(data) !== null) return true;
      if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
      return false;
    }
    function constructYamlTimestamp(data) {
      var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
      match = YAML_DATE_REGEXP.exec(data);
      if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
      if (match === null) throw new Error("Date resolve error");
      year = +match[1];
      month = +match[2] - 1;
      day = +match[3];
      if (!match[4]) {
        return new Date(Date.UTC(year, month, day));
      }
      hour = +match[4];
      minute = +match[5];
      second = +match[6];
      if (match[7]) {
        fraction = match[7].slice(0, 3);
        while (fraction.length < 3) {
          fraction += "0";
        }
        fraction = +fraction;
      }
      if (match[9]) {
        tz_hour = +match[10];
        tz_minute = +(match[11] || 0);
        delta = (tz_hour * 60 + tz_minute) * 6e4;
        if (match[9] === "-") delta = -delta;
      }
      date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
      if (delta) date.setTime(date.getTime() - delta);
      return date;
    }
    function representYamlTimestamp(object) {
      return object.toISOString();
    }
    module2.exports = new Type("tag:yaml.org,2002:timestamp", {
      kind: "scalar",
      resolve: resolveYamlTimestamp,
      construct: constructYamlTimestamp,
      instanceOf: Date,
      represent: representYamlTimestamp
    });
  }
});

// node_modules/js-yaml/lib/type/merge.js
var require_merge = __commonJS({
  "node_modules/js-yaml/lib/type/merge.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    function resolveYamlMerge(data) {
      return data === "<<" || data === null;
    }
    module2.exports = new Type("tag:yaml.org,2002:merge", {
      kind: "scalar",
      resolve: resolveYamlMerge
    });
  }
});

// node_modules/js-yaml/lib/type/binary.js
var require_binary = __commonJS({
  "node_modules/js-yaml/lib/type/binary.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
    function resolveYamlBinary(data) {
      if (data === null) return false;
      var code, idx, bitlen = 0, max = data.length, map = BASE64_MAP;
      for (idx = 0; idx < max; idx++) {
        code = map.indexOf(data.charAt(idx));
        if (code > 64) continue;
        if (code < 0) return false;
        bitlen += 6;
      }
      return bitlen % 8 === 0;
    }
    function constructYamlBinary(data) {
      var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map = BASE64_MAP, bits = 0, result = [];
      for (idx = 0; idx < max; idx++) {
        if (idx % 4 === 0 && idx) {
          result.push(bits >> 16 & 255);
          result.push(bits >> 8 & 255);
          result.push(bits & 255);
        }
        bits = bits << 6 | map.indexOf(input.charAt(idx));
      }
      tailbits = max % 4 * 6;
      if (tailbits === 0) {
        result.push(bits >> 16 & 255);
        result.push(bits >> 8 & 255);
        result.push(bits & 255);
      } else if (tailbits === 18) {
        result.push(bits >> 10 & 255);
        result.push(bits >> 2 & 255);
      } else if (tailbits === 12) {
        result.push(bits >> 4 & 255);
      }
      return new Uint8Array(result);
    }
    function representYamlBinary(object) {
      var result = "", bits = 0, idx, tail, max = object.length, map = BASE64_MAP;
      for (idx = 0; idx < max; idx++) {
        if (idx % 3 === 0 && idx) {
          result += map[bits >> 18 & 63];
          result += map[bits >> 12 & 63];
          result += map[bits >> 6 & 63];
          result += map[bits & 63];
        }
        bits = (bits << 8) + object[idx];
      }
      tail = max % 3;
      if (tail === 0) {
        result += map[bits >> 18 & 63];
        result += map[bits >> 12 & 63];
        result += map[bits >> 6 & 63];
        result += map[bits & 63];
      } else if (tail === 2) {
        result += map[bits >> 10 & 63];
        result += map[bits >> 4 & 63];
        result += map[bits << 2 & 63];
        result += map[64];
      } else if (tail === 1) {
        result += map[bits >> 2 & 63];
        result += map[bits << 4 & 63];
        result += map[64];
        result += map[64];
      }
      return result;
    }
    function isBinary(obj) {
      return Object.prototype.toString.call(obj) === "[object Uint8Array]";
    }
    module2.exports = new Type("tag:yaml.org,2002:binary", {
      kind: "scalar",
      resolve: resolveYamlBinary,
      construct: constructYamlBinary,
      predicate: isBinary,
      represent: representYamlBinary
    });
  }
});

// node_modules/js-yaml/lib/type/omap.js
var require_omap = __commonJS({
  "node_modules/js-yaml/lib/type/omap.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    var _hasOwnProperty = Object.prototype.hasOwnProperty;
    var _toString = Object.prototype.toString;
    function resolveYamlOmap(data) {
      if (data === null) return true;
      var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
      for (index = 0, length = object.length; index < length; index += 1) {
        pair = object[index];
        pairHasKey = false;
        if (_toString.call(pair) !== "[object Object]") return false;
        for (pairKey in pair) {
          if (_hasOwnProperty.call(pair, pairKey)) {
            if (!pairHasKey) pairHasKey = true;
            else return false;
          }
        }
        if (!pairHasKey) return false;
        if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
        else return false;
      }
      return true;
    }
    function constructYamlOmap(data) {
      return data !== null ? data : [];
    }
    module2.exports = new Type("tag:yaml.org,2002:omap", {
      kind: "sequence",
      resolve: resolveYamlOmap,
      construct: constructYamlOmap
    });
  }
});

// node_modules/js-yaml/lib/type/pairs.js
var require_pairs = __commonJS({
  "node_modules/js-yaml/lib/type/pairs.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    var _toString = Object.prototype.toString;
    function resolveYamlPairs(data) {
      if (data === null) return true;
      var index, length, pair, keys, result, object = data;
      result = new Array(object.length);
      for (index = 0, length = object.length; index < length; index += 1) {
        pair = object[index];
        if (_toString.call(pair) !== "[object Object]") return false;
        keys = Object.keys(pair);
        if (keys.length !== 1) return false;
        result[index] = [keys[0], pair[keys[0]]];
      }
      return true;
    }
    function constructYamlPairs(data) {
      if (data === null) return [];
      var index, length, pair, keys, result, object = data;
      result = new Array(object.length);
      for (index = 0, length = object.length; index < length; index += 1) {
        pair = object[index];
        keys = Object.keys(pair);
        result[index] = [keys[0], pair[keys[0]]];
      }
      return result;
    }
    module2.exports = new Type("tag:yaml.org,2002:pairs", {
      kind: "sequence",
      resolve: resolveYamlPairs,
      construct: constructYamlPairs
    });
  }
});

// node_modules/js-yaml/lib/type/set.js
var require_set = __commonJS({
  "node_modules/js-yaml/lib/type/set.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    var _hasOwnProperty = Object.prototype.hasOwnProperty;
    function resolveYamlSet(data) {
      if (data === null) return true;
      var key, object = data;
      for (key in object) {
        if (_hasOwnProperty.call(object, key)) {
          if (object[key] !== null) return false;
        }
      }
      return true;
    }
    function constructYamlSet(data) {
      return data !== null ? data : {};
    }
    module2.exports = new Type("tag:yaml.org,2002:set", {
      kind: "mapping",
      resolve: resolveYamlSet,
      construct: constructYamlSet
    });
  }
});

// node_modules/js-yaml/lib/schema/default.js
var require_default = __commonJS({
  "node_modules/js-yaml/lib/schema/default.js"(exports2, module2) {
    "use strict";
    module2.exports = require_core().extend({
      implicit: [
        require_timestamp(),
        require_merge()
      ],
      explicit: [
        require_binary(),
        require_omap(),
        require_pairs(),
        require_set()
      ]
    });
  }
});

// node_modules/js-yaml/lib/loader.js
var require_loader = __commonJS({
  "node_modules/js-yaml/lib/loader.js"(exports2, module2) {
    "use strict";
    var common = require_common();
    var YAMLException = require_exception();
    var makeSnippet = require_snippet();
    var DEFAULT_SCHEMA = require_default();
    var _hasOwnProperty = Object.prototype.hasOwnProperty;
    var CONTEXT_FLOW_IN = 1;
    var CONTEXT_FLOW_OUT = 2;
    var CONTEXT_BLOCK_IN = 3;
    var CONTEXT_BLOCK_OUT = 4;
    var CHOMPING_CLIP = 1;
    var CHOMPING_STRIP = 2;
    var CHOMPING_KEEP = 3;
    var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
    var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
    var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
    var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
    var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
    function _class(obj) {
      return Object.prototype.toString.call(obj);
    }
    function is_EOL(c) {
      return c === 10 || c === 13;
    }
    function is_WHITE_SPACE(c) {
      return c === 9 || c === 32;
    }
    function is_WS_OR_EOL(c) {
      return c === 9 || c === 32 || c === 10 || c === 13;
    }
    function is_FLOW_INDICATOR(c) {
      return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
    }
    function fromHexCode(c) {
      var lc;
      if (48 <= c && c <= 57) {
        return c - 48;
      }
      lc = c | 32;
      if (97 <= lc && lc <= 102) {
        return lc - 97 + 10;
      }
      return -1;
    }
    function escapedHexLen(c) {
      if (c === 120) {
        return 2;
      }
      if (c === 117) {
        return 4;
      }
      if (c === 85) {
        return 8;
      }
      return 0;
    }
    function fromDecimalCode(c) {
      if (48 <= c && c <= 57) {
        return c - 48;
      }
      return -1;
    }
    function simpleEscapeSequence(c) {
      return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
    }
    function charFromCodepoint(c) {
      if (c <= 65535) {
        return String.fromCharCode(c);
      }
      return String.fromCharCode(
        (c - 65536 >> 10) + 55296,
        (c - 65536 & 1023) + 56320
      );
    }
    var simpleEscapeCheck = new Array(256);
    var simpleEscapeMap = new Array(256);
    for (i = 0; i < 256; i++) {
      simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
      simpleEscapeMap[i] = simpleEscapeSequence(i);
    }
    var i;
    function State(input, options) {
      this.input = input;
      this.filename = options["filename"] || null;
      this.schema = options["schema"] || DEFAULT_SCHEMA;
      this.onWarning = options["onWarning"] || null;
      this.legacy = options["legacy"] || false;
      this.json = options["json"] || false;
      this.listener = options["listener"] || null;
      this.implicitTypes = this.schema.compiledImplicit;
      this.typeMap = this.schema.compiledTypeMap;
      this.length = input.length;
      this.position = 0;
      this.line = 0;
      this.lineStart = 0;
      this.lineIndent = 0;
      this.firstTabInLine = -1;
      this.documents = [];
    }
    function generateError(state, message) {
      var mark = {
        name: state.filename,
        buffer: state.input.slice(0, -1),
        // omit trailing \0
        position: state.position,
        line: state.line,
        column: state.position - state.lineStart
      };
      mark.snippet = makeSnippet(mark);
      return new YAMLException(message, mark);
    }
    function throwError(state, message) {
      throw generateError(state, message);
    }
    function throwWarning(state, message) {
      if (state.onWarning) {
        state.onWarning.call(null, generateError(state, message));
      }
    }
    var directiveHandlers = {
      YAML: function handleYamlDirective(state, name, args) {
        var match, major, minor;
        if (state.version !== null) {
          throwError(state, "duplication of %YAML directive");
        }
        if (args.length !== 1) {
          throwError(state, "YAML directive accepts exactly one argument");
        }
        match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
        if (match === null) {
          throwError(state, "ill-formed argument of the YAML directive");
        }
        major = parseInt(match[1], 10);
        minor = parseInt(match[2], 10);
        if (major !== 1) {
          throwError(state, "unacceptable YAML version of the document");
        }
        state.version = args[0];
        state.checkLineBreaks = minor < 2;
        if (minor !== 1 && minor !== 2) {
          throwWarning(state, "unsupported YAML version of the document");
        }
      },
      TAG: function handleTagDirective(state, name, args) {
        var handle, prefix;
        if (args.length !== 2) {
          throwError(state, "TAG directive accepts exactly two arguments");
        }
        handle = args[0];
        prefix = args[1];
        if (!PATTERN_TAG_HANDLE.test(handle)) {
          throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
        }
        if (_hasOwnProperty.call(state.tagMap, handle)) {
          throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
        }
        if (!PATTERN_TAG_URI.test(prefix)) {
          throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
        }
        try {
          prefix = decodeURIComponent(prefix);
        } catch (err) {
          throwError(state, "tag prefix is malformed: " + prefix);
        }
        state.tagMap[handle] = prefix;
      }
    };
    function captureSegment(state, start, end, checkJson) {
      var _position, _length, _character, _result;
      if (start < end) {
        _result = state.input.slice(start, end);
        if (checkJson) {
          for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
            _character = _result.charCodeAt(_position);
            if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
              throwError(state, "expected valid JSON character");
            }
          }
        } else if (PATTERN_NON_PRINTABLE.test(_result)) {
          throwError(state, "the stream contains non-printable characters");
        }
        state.result += _result;
      }
    }
    function mergeMappings(state, destination, source, overridableKeys) {
      var sourceKeys, key, index, quantity;
      if (!common.isObject(source)) {
        throwError(state, "cannot merge mappings; the provided source object is unacceptable");
      }
      sourceKeys = Object.keys(source);
      for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
        key = sourceKeys[index];
        if (!_hasOwnProperty.call(destination, key)) {
          destination[key] = source[key];
          overridableKeys[key] = true;
        }
      }
    }
    function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
      var index, quantity;
      if (Array.isArray(keyNode)) {
        keyNode = Array.prototype.slice.call(keyNode);
        for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
          if (Array.isArray(keyNode[index])) {
            throwError(state, "nested arrays are not supported inside keys");
          }
          if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
            keyNode[index] = "[object Object]";
          }
        }
      }
      if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
        keyNode = "[object Object]";
      }
      keyNode = String(keyNode);
      if (_result === null) {
        _result = {};
      }
      if (keyTag === "tag:yaml.org,2002:merge") {
        if (Array.isArray(valueNode)) {
          for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
            mergeMappings(state, _result, valueNode[index], overridableKeys);
          }
        } else {
          mergeMappings(state, _result, valueNode, overridableKeys);
        }
      } else {
        if (!state.json && !_hasOwnProperty.call(overridableKeys, keyNode) && _hasOwnProperty.call(_result, keyNode)) {
          state.line = startLine || state.line;
          state.lineStart = startLineStart || state.lineStart;
          state.position = startPos || state.position;
          throwError(state, "duplicated mapping key");
        }
        if (keyNode === "__proto__") {
          Object.defineProperty(_result, keyNode, {
            configurable: true,
            enumerable: true,
            writable: true,
            value: valueNode
          });
        } else {
          _result[keyNode] = valueNode;
        }
        delete overridableKeys[keyNode];
      }
      return _result;
    }
    function readLineBreak(state) {
      var ch;
      ch = state.input.charCodeAt(state.position);
      if (ch === 10) {
        state.position++;
      } else if (ch === 13) {
        state.position++;
        if (state.input.charCodeAt(state.position) === 10) {
          state.position++;
        }
      } else {
        throwError(state, "a line break is expected");
      }
      state.line += 1;
      state.lineStart = state.position;
      state.firstTabInLine = -1;
    }
    function skipSeparationSpace(state, allowComments, checkIndent) {
      var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
      while (ch !== 0) {
        while (is_WHITE_SPACE(ch)) {
          if (ch === 9 && state.firstTabInLine === -1) {
            state.firstTabInLine = state.position;
          }
          ch = state.input.charCodeAt(++state.position);
        }
        if (allowComments && ch === 35) {
          do {
            ch = state.input.charCodeAt(++state.position);
          } while (ch !== 10 && ch !== 13 && ch !== 0);
        }
        if (is_EOL(ch)) {
          readLineBreak(state);
          ch = state.input.charCodeAt(state.position);
          lineBreaks++;
          state.lineIndent = 0;
          while (ch === 32) {
            state.lineIndent++;
            ch = state.input.charCodeAt(++state.position);
          }
        } else {
          break;
        }
      }
      if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
        throwWarning(state, "deficient indentation");
      }
      return lineBreaks;
    }
    function testDocumentSeparator(state) {
      var _position = state.position, ch;
      ch = state.input.charCodeAt(_position);
      if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
        _position += 3;
        ch = state.input.charCodeAt(_position);
        if (ch === 0 || is_WS_OR_EOL(ch)) {
          return true;
        }
      }
      return false;
    }
    function writeFoldedLines(state, count) {
      if (count === 1) {
        state.result += " ";
      } else if (count > 1) {
        state.result += common.repeat("\n", count - 1);
      }
    }
    function readPlainScalar(state, nodeIndent, withinFlowCollection) {
      var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
      ch = state.input.charCodeAt(state.position);
      if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
        return false;
      }
      if (ch === 63 || ch === 45) {
        following = state.input.charCodeAt(state.position + 1);
        if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
          return false;
        }
      }
      state.kind = "scalar";
      state.result = "";
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
      while (ch !== 0) {
        if (ch === 58) {
          following = state.input.charCodeAt(state.position + 1);
          if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
            break;
          }
        } else if (ch === 35) {
          preceding = state.input.charCodeAt(state.position - 1);
          if (is_WS_OR_EOL(preceding)) {
            break;
          }
        } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
          break;
        } else if (is_EOL(ch)) {
          _line = state.line;
          _lineStart = state.lineStart;
          _lineIndent = state.lineIndent;
          skipSeparationSpace(state, false, -1);
          if (state.lineIndent >= nodeIndent) {
            hasPendingContent = true;
            ch = state.input.charCodeAt(state.position);
            continue;
          } else {
            state.position = captureEnd;
            state.line = _line;
            state.lineStart = _lineStart;
            state.lineIndent = _lineIndent;
            break;
          }
        }
        if (hasPendingContent) {
          captureSegment(state, captureStart, captureEnd, false);
          writeFoldedLines(state, state.line - _line);
          captureStart = captureEnd = state.position;
          hasPendingContent = false;
        }
        if (!is_WHITE_SPACE(ch)) {
          captureEnd = state.position + 1;
        }
        ch = state.input.charCodeAt(++state.position);
      }
      captureSegment(state, captureStart, captureEnd, false);
      if (state.result) {
        return true;
      }
      state.kind = _kind;
      state.result = _result;
      return false;
    }
    function readSingleQuotedScalar(state, nodeIndent) {
      var ch, captureStart, captureEnd;
      ch = state.input.charCodeAt(state.position);
      if (ch !== 39) {
        return false;
      }
      state.kind = "scalar";
      state.result = "";
      state.position++;
      captureStart = captureEnd = state.position;
      while ((ch = state.input.charCodeAt(state.position)) !== 0) {
        if (ch === 39) {
          captureSegment(state, captureStart, state.position, true);
          ch = state.input.charCodeAt(++state.position);
          if (ch === 39) {
            captureStart = state.position;
            state.position++;
            captureEnd = state.position;
          } else {
            return true;
          }
        } else if (is_EOL(ch)) {
          captureSegment(state, captureStart, captureEnd, true);
          writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
          captureStart = captureEnd = state.position;
        } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
          throwError(state, "unexpected end of the document within a single quoted scalar");
        } else {
          state.position++;
          captureEnd = state.position;
        }
      }
      throwError(state, "unexpected end of the stream within a single quoted scalar");
    }
    function readDoubleQuotedScalar(state, nodeIndent) {
      var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
      ch = state.input.charCodeAt(state.position);
      if (ch !== 34) {
        return false;
      }
      state.kind = "scalar";
      state.result = "";
      state.position++;
      captureStart = captureEnd = state.position;
      while ((ch = state.input.charCodeAt(state.position)) !== 0) {
        if (ch === 34) {
          captureSegment(state, captureStart, state.position, true);
          state.position++;
          return true;
        } else if (ch === 92) {
          captureSegment(state, captureStart, state.position, true);
          ch = state.input.charCodeAt(++state.position);
          if (is_EOL(ch)) {
            skipSeparationSpace(state, false, nodeIndent);
          } else if (ch < 256 && simpleEscapeCheck[ch]) {
            state.result += simpleEscapeMap[ch];
            state.position++;
          } else if ((tmp = escapedHexLen(ch)) > 0) {
            hexLength = tmp;
            hexResult = 0;
            for (; hexLength > 0; hexLength--) {
              ch = state.input.charCodeAt(++state.position);
              if ((tmp = fromHexCode(ch)) >= 0) {
                hexResult = (hexResult << 4) + tmp;
              } else {
                throwError(state, "expected hexadecimal character");
              }
            }
            state.result += charFromCodepoint(hexResult);
            state.position++;
          } else {
            throwError(state, "unknown escape sequence");
          }
          captureStart = captureEnd = state.position;
        } else if (is_EOL(ch)) {
          captureSegment(state, captureStart, captureEnd, true);
          writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
          captureStart = captureEnd = state.position;
        } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
          throwError(state, "unexpected end of the document within a double quoted scalar");
        } else {
          state.position++;
          captureEnd = state.position;
        }
      }
      throwError(state, "unexpected end of the stream within a double quoted scalar");
    }
    function readFlowCollection(state, nodeIndent) {
      var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
      ch = state.input.charCodeAt(state.position);
      if (ch === 91) {
        terminator = 93;
        isMapping = false;
        _result = [];
      } else if (ch === 123) {
        terminator = 125;
        isMapping = true;
        _result = {};
      } else {
        return false;
      }
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = _result;
      }
      ch = state.input.charCodeAt(++state.position);
      while (ch !== 0) {
        skipSeparationSpace(state, true, nodeIndent);
        ch = state.input.charCodeAt(state.position);
        if (ch === terminator) {
          state.position++;
          state.tag = _tag;
          state.anchor = _anchor;
          state.kind = isMapping ? "mapping" : "sequence";
          state.result = _result;
          return true;
        } else if (!readNext) {
          throwError(state, "missed comma between flow collection entries");
        } else if (ch === 44) {
          throwError(state, "expected the node content, but found ','");
        }
        keyTag = keyNode = valueNode = null;
        isPair = isExplicitPair = false;
        if (ch === 63) {
          following = state.input.charCodeAt(state.position + 1);
          if (is_WS_OR_EOL(following)) {
            isPair = isExplicitPair = true;
            state.position++;
            skipSeparationSpace(state, true, nodeIndent);
          }
        }
        _line = state.line;
        _lineStart = state.lineStart;
        _pos = state.position;
        composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
        keyTag = state.tag;
        keyNode = state.result;
        skipSeparationSpace(state, true, nodeIndent);
        ch = state.input.charCodeAt(state.position);
        if ((isExplicitPair || state.line === _line) && ch === 58) {
          isPair = true;
          ch = state.input.charCodeAt(++state.position);
          skipSeparationSpace(state, true, nodeIndent);
          composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
          valueNode = state.result;
        }
        if (isMapping) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
        } else if (isPair) {
          _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
        } else {
          _result.push(keyNode);
        }
        skipSeparationSpace(state, true, nodeIndent);
        ch = state.input.charCodeAt(state.position);
        if (ch === 44) {
          readNext = true;
          ch = state.input.charCodeAt(++state.position);
        } else {
          readNext = false;
        }
      }
      throwError(state, "unexpected end of the stream within a flow collection");
    }
    function readBlockScalar(state, nodeIndent) {
      var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
      ch = state.input.charCodeAt(state.position);
      if (ch === 124) {
        folding = false;
      } else if (ch === 62) {
        folding = true;
      } else {
        return false;
      }
      state.kind = "scalar";
      state.result = "";
      while (ch !== 0) {
        ch = state.input.charCodeAt(++state.position);
        if (ch === 43 || ch === 45) {
          if (CHOMPING_CLIP === chomping) {
            chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
          } else {
            throwError(state, "repeat of a chomping mode identifier");
          }
        } else if ((tmp = fromDecimalCode(ch)) >= 0) {
          if (tmp === 0) {
            throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
          } else if (!detectedIndent) {
            textIndent = nodeIndent + tmp - 1;
            detectedIndent = true;
          } else {
            throwError(state, "repeat of an indentation width identifier");
          }
        } else {
          break;
        }
      }
      if (is_WHITE_SPACE(ch)) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (is_WHITE_SPACE(ch));
        if (ch === 35) {
          do {
            ch = state.input.charCodeAt(++state.position);
          } while (!is_EOL(ch) && ch !== 0);
        }
      }
      while (ch !== 0) {
        readLineBreak(state);
        state.lineIndent = 0;
        ch = state.input.charCodeAt(state.position);
        while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
          state.lineIndent++;
          ch = state.input.charCodeAt(++state.position);
        }
        if (!detectedIndent && state.lineIndent > textIndent) {
          textIndent = state.lineIndent;
        }
        if (is_EOL(ch)) {
          emptyLines++;
          continue;
        }
        if (state.lineIndent < textIndent) {
          if (chomping === CHOMPING_KEEP) {
            state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
          } else if (chomping === CHOMPING_CLIP) {
            if (didReadContent) {
              state.result += "\n";
            }
          }
          break;
        }
        if (folding) {
          if (is_WHITE_SPACE(ch)) {
            atMoreIndented = true;
            state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
          } else if (atMoreIndented) {
            atMoreIndented = false;
            state.result += common.repeat("\n", emptyLines + 1);
          } else if (emptyLines === 0) {
            if (didReadContent) {
              state.result += " ";
            }
          } else {
            state.result += common.repeat("\n", emptyLines);
          }
        } else {
          state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        }
        didReadContent = true;
        detectedIndent = true;
        emptyLines = 0;
        captureStart = state.position;
        while (!is_EOL(ch) && ch !== 0) {
          ch = state.input.charCodeAt(++state.position);
        }
        captureSegment(state, captureStart, state.position, false);
      }
      return true;
    }
    function readBlockSequence(state, nodeIndent) {
      var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
      if (state.firstTabInLine !== -1) return false;
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = _result;
      }
      ch = state.input.charCodeAt(state.position);
      while (ch !== 0) {
        if (state.firstTabInLine !== -1) {
          state.position = state.firstTabInLine;
          throwError(state, "tab characters must not be used in indentation");
        }
        if (ch !== 45) {
          break;
        }
        following = state.input.charCodeAt(state.position + 1);
        if (!is_WS_OR_EOL(following)) {
          break;
        }
        detected = true;
        state.position++;
        if (skipSeparationSpace(state, true, -1)) {
          if (state.lineIndent <= nodeIndent) {
            _result.push(null);
            ch = state.input.charCodeAt(state.position);
            continue;
          }
        }
        _line = state.line;
        composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
        _result.push(state.result);
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
        if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
          throwError(state, "bad indentation of a sequence entry");
        } else if (state.lineIndent < nodeIndent) {
          break;
        }
      }
      if (detected) {
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = "sequence";
        state.result = _result;
        return true;
      }
      return false;
    }
    function readBlockMapping(state, nodeIndent, flowIndent) {
      var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
      if (state.firstTabInLine !== -1) return false;
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = _result;
      }
      ch = state.input.charCodeAt(state.position);
      while (ch !== 0) {
        if (!atExplicitKey && state.firstTabInLine !== -1) {
          state.position = state.firstTabInLine;
          throwError(state, "tab characters must not be used in indentation");
        }
        following = state.input.charCodeAt(state.position + 1);
        _line = state.line;
        if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
          if (ch === 63) {
            if (atExplicitKey) {
              storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
              keyTag = keyNode = valueNode = null;
            }
            detected = true;
            atExplicitKey = true;
            allowCompact = true;
          } else if (atExplicitKey) {
            atExplicitKey = false;
            allowCompact = true;
          } else {
            throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
          }
          state.position += 1;
          ch = following;
        } else {
          _keyLine = state.line;
          _keyLineStart = state.lineStart;
          _keyPos = state.position;
          if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
            break;
          }
          if (state.line === _line) {
            ch = state.input.charCodeAt(state.position);
            while (is_WHITE_SPACE(ch)) {
              ch = state.input.charCodeAt(++state.position);
            }
            if (ch === 58) {
              ch = state.input.charCodeAt(++state.position);
              if (!is_WS_OR_EOL(ch)) {
                throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
              }
              if (atExplicitKey) {
                storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
                keyTag = keyNode = valueNode = null;
              }
              detected = true;
              atExplicitKey = false;
              allowCompact = false;
              keyTag = state.tag;
              keyNode = state.result;
            } else if (detected) {
              throwError(state, "can not read an implicit mapping pair; a colon is missed");
            } else {
              state.tag = _tag;
              state.anchor = _anchor;
              return true;
            }
          } else if (detected) {
            throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
          } else {
            state.tag = _tag;
            state.anchor = _anchor;
            return true;
          }
        }
        if (state.line === _line || state.lineIndent > nodeIndent) {
          if (atExplicitKey) {
            _keyLine = state.line;
            _keyLineStart = state.lineStart;
            _keyPos = state.position;
          }
          if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
            if (atExplicitKey) {
              keyNode = state.result;
            } else {
              valueNode = state.result;
            }
          }
          if (!atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          skipSeparationSpace(state, true, -1);
          ch = state.input.charCodeAt(state.position);
        }
        if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
          throwError(state, "bad indentation of a mapping entry");
        } else if (state.lineIndent < nodeIndent) {
          break;
        }
      }
      if (atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
      }
      if (detected) {
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = "mapping";
        state.result = _result;
      }
      return detected;
    }
    function readTagProperty(state) {
      var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
      ch = state.input.charCodeAt(state.position);
      if (ch !== 33) return false;
      if (state.tag !== null) {
        throwError(state, "duplication of a tag property");
      }
      ch = state.input.charCodeAt(++state.position);
      if (ch === 60) {
        isVerbatim = true;
        ch = state.input.charCodeAt(++state.position);
      } else if (ch === 33) {
        isNamed = true;
        tagHandle = "!!";
        ch = state.input.charCodeAt(++state.position);
      } else {
        tagHandle = "!";
      }
      _position = state.position;
      if (isVerbatim) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && ch !== 62);
        if (state.position < state.length) {
          tagName = state.input.slice(_position, state.position);
          ch = state.input.charCodeAt(++state.position);
        } else {
          throwError(state, "unexpected end of the stream within a verbatim tag");
        }
      } else {
        while (ch !== 0 && !is_WS_OR_EOL(ch)) {
          if (ch === 33) {
            if (!isNamed) {
              tagHandle = state.input.slice(_position - 1, state.position + 1);
              if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
                throwError(state, "named tag handle cannot contain such characters");
              }
              isNamed = true;
              _position = state.position + 1;
            } else {
              throwError(state, "tag suffix cannot contain exclamation marks");
            }
          }
          ch = state.input.charCodeAt(++state.position);
        }
        tagName = state.input.slice(_position, state.position);
        if (PATTERN_FLOW_INDICATORS.test(tagName)) {
          throwError(state, "tag suffix cannot contain flow indicator characters");
        }
      }
      if (tagName && !PATTERN_TAG_URI.test(tagName)) {
        throwError(state, "tag name cannot contain such characters: " + tagName);
      }
      try {
        tagName = decodeURIComponent(tagName);
      } catch (err) {
        throwError(state, "tag name is malformed: " + tagName);
      }
      if (isVerbatim) {
        state.tag = tagName;
      } else if (_hasOwnProperty.call(state.tagMap, tagHandle)) {
        state.tag = state.tagMap[tagHandle] + tagName;
      } else if (tagHandle === "!") {
        state.tag = "!" + tagName;
      } else if (tagHandle === "!!") {
        state.tag = "tag:yaml.org,2002:" + tagName;
      } else {
        throwError(state, 'undeclared tag handle "' + tagHandle + '"');
      }
      return true;
    }
    function readAnchorProperty(state) {
      var _position, ch;
      ch = state.input.charCodeAt(state.position);
      if (ch !== 38) return false;
      if (state.anchor !== null) {
        throwError(state, "duplication of an anchor property");
      }
      ch = state.input.charCodeAt(++state.position);
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (state.position === _position) {
        throwError(state, "name of an anchor node must contain at least one character");
      }
      state.anchor = state.input.slice(_position, state.position);
      return true;
    }
    function readAlias(state) {
      var _position, alias, ch;
      ch = state.input.charCodeAt(state.position);
      if (ch !== 42) return false;
      ch = state.input.charCodeAt(++state.position);
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (state.position === _position) {
        throwError(state, "name of an alias node must contain at least one character");
      }
      alias = state.input.slice(_position, state.position);
      if (!_hasOwnProperty.call(state.anchorMap, alias)) {
        throwError(state, 'unidentified alias "' + alias + '"');
      }
      state.result = state.anchorMap[alias];
      skipSeparationSpace(state, true, -1);
      return true;
    }
    function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
      var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type, flowIndent, blockIndent;
      if (state.listener !== null) {
        state.listener("open", state);
      }
      state.tag = null;
      state.anchor = null;
      state.kind = null;
      state.result = null;
      allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
      if (allowToSeek) {
        if (skipSeparationSpace(state, true, -1)) {
          atNewLine = true;
          if (state.lineIndent > parentIndent) {
            indentStatus = 1;
          } else if (state.lineIndent === parentIndent) {
            indentStatus = 0;
          } else if (state.lineIndent < parentIndent) {
            indentStatus = -1;
          }
        }
      }
      if (indentStatus === 1) {
        while (readTagProperty(state) || readAnchorProperty(state)) {
          if (skipSeparationSpace(state, true, -1)) {
            atNewLine = true;
            allowBlockCollections = allowBlockStyles;
            if (state.lineIndent > parentIndent) {
              indentStatus = 1;
            } else if (state.lineIndent === parentIndent) {
              indentStatus = 0;
            } else if (state.lineIndent < parentIndent) {
              indentStatus = -1;
            }
          } else {
            allowBlockCollections = false;
          }
        }
      }
      if (allowBlockCollections) {
        allowBlockCollections = atNewLine || allowCompact;
      }
      if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
        if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
          flowIndent = parentIndent;
        } else {
          flowIndent = parentIndent + 1;
        }
        blockIndent = state.position - state.lineStart;
        if (indentStatus === 1) {
          if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
            hasContent = true;
          } else {
            if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
              hasContent = true;
            } else if (readAlias(state)) {
              hasContent = true;
              if (state.tag !== null || state.anchor !== null) {
                throwError(state, "alias node should not have any properties");
              }
            } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
              hasContent = true;
              if (state.tag === null) {
                state.tag = "?";
              }
            }
            if (state.anchor !== null) {
              state.anchorMap[state.anchor] = state.result;
            }
          }
        } else if (indentStatus === 0) {
          hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
        }
      }
      if (state.tag === null) {
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      } else if (state.tag === "?") {
        if (state.result !== null && state.kind !== "scalar") {
          throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
        }
        for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
          type = state.implicitTypes[typeIndex];
          if (type.resolve(state.result)) {
            state.result = type.construct(state.result);
            state.tag = type.tag;
            if (state.anchor !== null) {
              state.anchorMap[state.anchor] = state.result;
            }
            break;
          }
        }
      } else if (state.tag !== "!") {
        if (_hasOwnProperty.call(state.typeMap[state.kind || "fallback"], state.tag)) {
          type = state.typeMap[state.kind || "fallback"][state.tag];
        } else {
          type = null;
          typeList = state.typeMap.multi[state.kind || "fallback"];
          for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
            if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
              type = typeList[typeIndex];
              break;
            }
          }
        }
        if (!type) {
          throwError(state, "unknown tag !<" + state.tag + ">");
        }
        if (state.result !== null && type.kind !== state.kind) {
          throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type.kind + '", not "' + state.kind + '"');
        }
        if (!type.resolve(state.result, state.tag)) {
          throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
        } else {
          state.result = type.construct(state.result, state.tag);
          if (state.anchor !== null) {
            state.anchorMap[state.anchor] = state.result;
          }
        }
      }
      if (state.listener !== null) {
        state.listener("close", state);
      }
      return state.tag !== null || state.anchor !== null || hasContent;
    }
    function readDocument(state) {
      var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
      state.version = null;
      state.checkLineBreaks = state.legacy;
      state.tagMap = /* @__PURE__ */ Object.create(null);
      state.anchorMap = /* @__PURE__ */ Object.create(null);
      while ((ch = state.input.charCodeAt(state.position)) !== 0) {
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
        if (state.lineIndent > 0 || ch !== 37) {
          break;
        }
        hasDirectives = true;
        ch = state.input.charCodeAt(++state.position);
        _position = state.position;
        while (ch !== 0 && !is_WS_OR_EOL(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        directiveName = state.input.slice(_position, state.position);
        directiveArgs = [];
        if (directiveName.length < 1) {
          throwError(state, "directive name must not be less than one character in length");
        }
        while (ch !== 0) {
          while (is_WHITE_SPACE(ch)) {
            ch = state.input.charCodeAt(++state.position);
          }
          if (ch === 35) {
            do {
              ch = state.input.charCodeAt(++state.position);
            } while (ch !== 0 && !is_EOL(ch));
            break;
          }
          if (is_EOL(ch)) break;
          _position = state.position;
          while (ch !== 0 && !is_WS_OR_EOL(ch)) {
            ch = state.input.charCodeAt(++state.position);
          }
          directiveArgs.push(state.input.slice(_position, state.position));
        }
        if (ch !== 0) readLineBreak(state);
        if (_hasOwnProperty.call(directiveHandlers, directiveName)) {
          directiveHandlers[directiveName](state, directiveName, directiveArgs);
        } else {
          throwWarning(state, 'unknown document directive "' + directiveName + '"');
        }
      }
      skipSeparationSpace(state, true, -1);
      if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
      } else if (hasDirectives) {
        throwError(state, "directives end mark is expected");
      }
      composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
      skipSeparationSpace(state, true, -1);
      if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
        throwWarning(state, "non-ASCII line breaks are interpreted as content");
      }
      state.documents.push(state.result);
      if (state.position === state.lineStart && testDocumentSeparator(state)) {
        if (state.input.charCodeAt(state.position) === 46) {
          state.position += 3;
          skipSeparationSpace(state, true, -1);
        }
        return;
      }
      if (state.position < state.length - 1) {
        throwError(state, "end of the stream or a document separator is expected");
      } else {
        return;
      }
    }
    function loadDocuments(input, options) {
      input = String(input);
      options = options || {};
      if (input.length !== 0) {
        if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
          input += "\n";
        }
        if (input.charCodeAt(0) === 65279) {
          input = input.slice(1);
        }
      }
      var state = new State(input, options);
      var nullpos = input.indexOf("\0");
      if (nullpos !== -1) {
        state.position = nullpos;
        throwError(state, "null byte is not allowed in input");
      }
      state.input += "\0";
      while (state.input.charCodeAt(state.position) === 32) {
        state.lineIndent += 1;
        state.position += 1;
      }
      while (state.position < state.length - 1) {
        readDocument(state);
      }
      return state.documents;
    }
    function loadAll(input, iterator, options) {
      if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
        options = iterator;
        iterator = null;
      }
      var documents = loadDocuments(input, options);
      if (typeof iterator !== "function") {
        return documents;
      }
      for (var index = 0, length = documents.length; index < length; index += 1) {
        iterator(documents[index]);
      }
    }
    function load(input, options) {
      var documents = loadDocuments(input, options);
      if (documents.length === 0) {
        return void 0;
      } else if (documents.length === 1) {
        return documents[0];
      }
      throw new YAMLException("expected a single document in the stream, but found more");
    }
    module2.exports.loadAll = loadAll;
    module2.exports.load = load;
  }
});

// node_modules/js-yaml/lib/dumper.js
var require_dumper = __commonJS({
  "node_modules/js-yaml/lib/dumper.js"(exports2, module2) {
    "use strict";
    var common = require_common();
    var YAMLException = require_exception();
    var DEFAULT_SCHEMA = require_default();
    var _toString = Object.prototype.toString;
    var _hasOwnProperty = Object.prototype.hasOwnProperty;
    var CHAR_BOM = 65279;
    var CHAR_TAB = 9;
    var CHAR_LINE_FEED = 10;
    var CHAR_CARRIAGE_RETURN = 13;
    var CHAR_SPACE = 32;
    var CHAR_EXCLAMATION = 33;
    var CHAR_DOUBLE_QUOTE = 34;
    var CHAR_SHARP = 35;
    var CHAR_PERCENT = 37;
    var CHAR_AMPERSAND = 38;
    var CHAR_SINGLE_QUOTE = 39;
    var CHAR_ASTERISK = 42;
    var CHAR_COMMA = 44;
    var CHAR_MINUS = 45;
    var CHAR_COLON = 58;
    var CHAR_EQUALS = 61;
    var CHAR_GREATER_THAN = 62;
    var CHAR_QUESTION = 63;
    var CHAR_COMMERCIAL_AT = 64;
    var CHAR_LEFT_SQUARE_BRACKET = 91;
    var CHAR_RIGHT_SQUARE_BRACKET = 93;
    var CHAR_GRAVE_ACCENT = 96;
    var CHAR_LEFT_CURLY_BRACKET = 123;
    var CHAR_VERTICAL_LINE = 124;
    var CHAR_RIGHT_CURLY_BRACKET = 125;
    var ESCAPE_SEQUENCES = {};
    ESCAPE_SEQUENCES[0] = "\\0";
    ESCAPE_SEQUENCES[7] = "\\a";
    ESCAPE_SEQUENCES[8] = "\\b";
    ESCAPE_SEQUENCES[9] = "\\t";
    ESCAPE_SEQUENCES[10] = "\\n";
    ESCAPE_SEQUENCES[11] = "\\v";
    ESCAPE_SEQUENCES[12] = "\\f";
    ESCAPE_SEQUENCES[13] = "\\r";
    ESCAPE_SEQUENCES[27] = "\\e";
    ESCAPE_SEQUENCES[34] = '\\"';
    ESCAPE_SEQUENCES[92] = "\\\\";
    ESCAPE_SEQUENCES[133] = "\\N";
    ESCAPE_SEQUENCES[160] = "\\_";
    ESCAPE_SEQUENCES[8232] = "\\L";
    ESCAPE_SEQUENCES[8233] = "\\P";
    var DEPRECATED_BOOLEANS_SYNTAX = [
      "y",
      "Y",
      "yes",
      "Yes",
      "YES",
      "on",
      "On",
      "ON",
      "n",
      "N",
      "no",
      "No",
      "NO",
      "off",
      "Off",
      "OFF"
    ];
    var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
    function compileStyleMap(schema, map) {
      var result, keys, index, length, tag, style, type;
      if (map === null) return {};
      result = {};
      keys = Object.keys(map);
      for (index = 0, length = keys.length; index < length; index += 1) {
        tag = keys[index];
        style = String(map[tag]);
        if (tag.slice(0, 2) === "!!") {
          tag = "tag:yaml.org,2002:" + tag.slice(2);
        }
        type = schema.compiledTypeMap["fallback"][tag];
        if (type && _hasOwnProperty.call(type.styleAliases, style)) {
          style = type.styleAliases[style];
        }
        result[tag] = style;
      }
      return result;
    }
    function encodeHex(character) {
      var string, handle, length;
      string = character.toString(16).toUpperCase();
      if (character <= 255) {
        handle = "x";
        length = 2;
      } else if (character <= 65535) {
        handle = "u";
        length = 4;
      } else if (character <= 4294967295) {
        handle = "U";
        length = 8;
      } else {
        throw new YAMLException("code point within a string may not be greater than 0xFFFFFFFF");
      }
      return "\\" + handle + common.repeat("0", length - string.length) + string;
    }
    var QUOTING_TYPE_SINGLE = 1;
    var QUOTING_TYPE_DOUBLE = 2;
    function State(options) {
      this.schema = options["schema"] || DEFAULT_SCHEMA;
      this.indent = Math.max(1, options["indent"] || 2);
      this.noArrayIndent = options["noArrayIndent"] || false;
      this.skipInvalid = options["skipInvalid"] || false;
      this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
      this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
      this.sortKeys = options["sortKeys"] || false;
      this.lineWidth = options["lineWidth"] || 80;
      this.noRefs = options["noRefs"] || false;
      this.noCompatMode = options["noCompatMode"] || false;
      this.condenseFlow = options["condenseFlow"] || false;
      this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
      this.forceQuotes = options["forceQuotes"] || false;
      this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
      this.implicitTypes = this.schema.compiledImplicit;
      this.explicitTypes = this.schema.compiledExplicit;
      this.tag = null;
      this.result = "";
      this.duplicates = [];
      this.usedDuplicates = null;
    }
    function indentString(string, spaces) {
      var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
      while (position < length) {
        next = string.indexOf("\n", position);
        if (next === -1) {
          line = string.slice(position);
          position = length;
        } else {
          line = string.slice(position, next + 1);
          position = next + 1;
        }
        if (line.length && line !== "\n") result += ind;
        result += line;
      }
      return result;
    }
    function generateNextLine(state, level) {
      return "\n" + common.repeat(" ", state.indent * level);
    }
    function testImplicitResolving(state, str) {
      var index, length, type;
      for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
        type = state.implicitTypes[index];
        if (type.resolve(str)) {
          return true;
        }
      }
      return false;
    }
    function isWhitespace(c) {
      return c === CHAR_SPACE || c === CHAR_TAB;
    }
    function isPrintable(c) {
      return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
    }
    function isNsCharOrWhitespace(c) {
      return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
    }
    function isPlainSafe(c, prev, inblock) {
      var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
      var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
      return (
        // ns-plain-safe
        (inblock ? (
          // c = flow-in
          cIsNsCharOrWhitespace
        ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
      );
    }
    function isPlainSafeFirst(c) {
      return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
    }
    function isPlainSafeLast(c) {
      return !isWhitespace(c) && c !== CHAR_COLON;
    }
    function codePointAt(string, pos) {
      var first = string.charCodeAt(pos), second;
      if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
        second = string.charCodeAt(pos + 1);
        if (second >= 56320 && second <= 57343) {
          return (first - 55296) * 1024 + second - 56320 + 65536;
        }
      }
      return first;
    }
    function needIndentIndicator(string) {
      var leadingSpaceRe = /^\n* /;
      return leadingSpaceRe.test(string);
    }
    var STYLE_PLAIN = 1;
    var STYLE_SINGLE = 2;
    var STYLE_LITERAL = 3;
    var STYLE_FOLDED = 4;
    var STYLE_DOUBLE = 5;
    function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
      var i;
      var char = 0;
      var prevChar = null;
      var hasLineBreak = false;
      var hasFoldableLine = false;
      var shouldTrackWidth = lineWidth !== -1;
      var previousLineBreak = -1;
      var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
      if (singleLineOnly || forceQuotes) {
        for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
          char = codePointAt(string, i);
          if (!isPrintable(char)) {
            return STYLE_DOUBLE;
          }
          plain = plain && isPlainSafe(char, prevChar, inblock);
          prevChar = char;
        }
      } else {
        for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
          char = codePointAt(string, i);
          if (char === CHAR_LINE_FEED) {
            hasLineBreak = true;
            if (shouldTrackWidth) {
              hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
              i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
              previousLineBreak = i;
            }
          } else if (!isPrintable(char)) {
            return STYLE_DOUBLE;
          }
          plain = plain && isPlainSafe(char, prevChar, inblock);
          prevChar = char;
        }
        hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
      }
      if (!hasLineBreak && !hasFoldableLine) {
        if (plain && !forceQuotes && !testAmbiguousType(string)) {
          return STYLE_PLAIN;
        }
        return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
      }
      if (indentPerLevel > 9 && needIndentIndicator(string)) {
        return STYLE_DOUBLE;
      }
      if (!forceQuotes) {
        return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
      }
      return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }
    function writeScalar(state, string, level, iskey, inblock) {
      state.dump = function() {
        if (string.length === 0) {
          return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
        }
        if (!state.noCompatMode) {
          if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
            return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
          }
        }
        var indent = state.indent * Math.max(1, level);
        var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
        var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
        function testAmbiguity(string2) {
          return testImplicitResolving(state, string2);
        }
        switch (chooseScalarStyle(
          string,
          singleLineOnly,
          state.indent,
          lineWidth,
          testAmbiguity,
          state.quotingType,
          state.forceQuotes && !iskey,
          inblock
        )) {
          case STYLE_PLAIN:
            return string;
          case STYLE_SINGLE:
            return "'" + string.replace(/'/g, "''") + "'";
          case STYLE_LITERAL:
            return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
          case STYLE_FOLDED:
            return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
          case STYLE_DOUBLE:
            return '"' + escapeString(string, lineWidth) + '"';
          default:
            throw new YAMLException("impossible error: invalid scalar style");
        }
      }();
    }
    function blockHeader(string, indentPerLevel) {
      var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
      var clip = string[string.length - 1] === "\n";
      var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
      var chomp = keep ? "+" : clip ? "" : "-";
      return indentIndicator + chomp + "\n";
    }
    function dropEndingNewline(string) {
      return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
    }
    function foldString(string, width) {
      var lineRe = /(\n+)([^\n]*)/g;
      var result = function() {
        var nextLF = string.indexOf("\n");
        nextLF = nextLF !== -1 ? nextLF : string.length;
        lineRe.lastIndex = nextLF;
        return foldLine(string.slice(0, nextLF), width);
      }();
      var prevMoreIndented = string[0] === "\n" || string[0] === " ";
      var moreIndented;
      var match;
      while (match = lineRe.exec(string)) {
        var prefix = match[1], line = match[2];
        moreIndented = line[0] === " ";
        result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
        prevMoreIndented = moreIndented;
      }
      return result;
    }
    function foldLine(line, width) {
      if (line === "" || line[0] === " ") return line;
      var breakRe = / [^ ]/g;
      var match;
      var start = 0, end, curr = 0, next = 0;
      var result = "";
      while (match = breakRe.exec(line)) {
        next = match.index;
        if (next - start > width) {
          end = curr > start ? curr : next;
          result += "\n" + line.slice(start, end);
          start = end + 1;
        }
        curr = next;
      }
      result += "\n";
      if (line.length - start > width && curr > start) {
        result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
      } else {
        result += line.slice(start);
      }
      return result.slice(1);
    }
    function escapeString(string) {
      var result = "";
      var char = 0;
      var escapeSeq;
      for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        escapeSeq = ESCAPE_SEQUENCES[char];
        if (!escapeSeq && isPrintable(char)) {
          result += string[i];
          if (char >= 65536) result += string[i + 1];
        } else {
          result += escapeSeq || encodeHex(char);
        }
      }
      return result;
    }
    function writeFlowSequence(state, level, object) {
      var _result = "", _tag = state.tag, index, length, value;
      for (index = 0, length = object.length; index < length; index += 1) {
        value = object[index];
        if (state.replacer) {
          value = state.replacer.call(object, String(index), value);
        }
        if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
          if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
          _result += state.dump;
        }
      }
      state.tag = _tag;
      state.dump = "[" + _result + "]";
    }
    function writeBlockSequence(state, level, object, compact) {
      var _result = "", _tag = state.tag, index, length, value;
      for (index = 0, length = object.length; index < length; index += 1) {
        value = object[index];
        if (state.replacer) {
          value = state.replacer.call(object, String(index), value);
        }
        if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
          if (!compact || _result !== "") {
            _result += generateNextLine(state, level);
          }
          if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
            _result += "-";
          } else {
            _result += "- ";
          }
          _result += state.dump;
        }
      }
      state.tag = _tag;
      state.dump = _result || "[]";
    }
    function writeFlowMapping(state, level, object) {
      var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
      for (index = 0, length = objectKeyList.length; index < length; index += 1) {
        pairBuffer = "";
        if (_result !== "") pairBuffer += ", ";
        if (state.condenseFlow) pairBuffer += '"';
        objectKey = objectKeyList[index];
        objectValue = object[objectKey];
        if (state.replacer) {
          objectValue = state.replacer.call(object, objectKey, objectValue);
        }
        if (!writeNode(state, level, objectKey, false, false)) {
          continue;
        }
        if (state.dump.length > 1024) pairBuffer += "? ";
        pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
        if (!writeNode(state, level, objectValue, false, false)) {
          continue;
        }
        pairBuffer += state.dump;
        _result += pairBuffer;
      }
      state.tag = _tag;
      state.dump = "{" + _result + "}";
    }
    function writeBlockMapping(state, level, object, compact) {
      var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
      if (state.sortKeys === true) {
        objectKeyList.sort();
      } else if (typeof state.sortKeys === "function") {
        objectKeyList.sort(state.sortKeys);
      } else if (state.sortKeys) {
        throw new YAMLException("sortKeys must be a boolean or a function");
      }
      for (index = 0, length = objectKeyList.length; index < length; index += 1) {
        pairBuffer = "";
        if (!compact || _result !== "") {
          pairBuffer += generateNextLine(state, level);
        }
        objectKey = objectKeyList[index];
        objectValue = object[objectKey];
        if (state.replacer) {
          objectValue = state.replacer.call(object, objectKey, objectValue);
        }
        if (!writeNode(state, level + 1, objectKey, true, true, true)) {
          continue;
        }
        explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
        if (explicitPair) {
          if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
            pairBuffer += "?";
          } else {
            pairBuffer += "? ";
          }
        }
        pairBuffer += state.dump;
        if (explicitPair) {
          pairBuffer += generateNextLine(state, level);
        }
        if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
          continue;
        }
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          pairBuffer += ":";
        } else {
          pairBuffer += ": ";
        }
        pairBuffer += state.dump;
        _result += pairBuffer;
      }
      state.tag = _tag;
      state.dump = _result || "{}";
    }
    function detectType(state, object, explicit) {
      var _result, typeList, index, length, type, style;
      typeList = explicit ? state.explicitTypes : state.implicitTypes;
      for (index = 0, length = typeList.length; index < length; index += 1) {
        type = typeList[index];
        if ((type.instanceOf || type.predicate) && (!type.instanceOf || typeof object === "object" && object instanceof type.instanceOf) && (!type.predicate || type.predicate(object))) {
          if (explicit) {
            if (type.multi && type.representName) {
              state.tag = type.representName(object);
            } else {
              state.tag = type.tag;
            }
          } else {
            state.tag = "?";
          }
          if (type.represent) {
            style = state.styleMap[type.tag] || type.defaultStyle;
            if (_toString.call(type.represent) === "[object Function]") {
              _result = type.represent(object, style);
            } else if (_hasOwnProperty.call(type.represent, style)) {
              _result = type.represent[style](object, style);
            } else {
              throw new YAMLException("!<" + type.tag + '> tag resolver accepts not "' + style + '" style');
            }
            state.dump = _result;
          }
          return true;
        }
      }
      return false;
    }
    function writeNode(state, level, object, block, compact, iskey, isblockseq) {
      state.tag = null;
      state.dump = object;
      if (!detectType(state, object, false)) {
        detectType(state, object, true);
      }
      var type = _toString.call(state.dump);
      var inblock = block;
      var tagStr;
      if (block) {
        block = state.flowLevel < 0 || state.flowLevel > level;
      }
      var objectOrArray = type === "[object Object]" || type === "[object Array]", duplicateIndex, duplicate;
      if (objectOrArray) {
        duplicateIndex = state.duplicates.indexOf(object);
        duplicate = duplicateIndex !== -1;
      }
      if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
        compact = false;
      }
      if (duplicate && state.usedDuplicates[duplicateIndex]) {
        state.dump = "*ref_" + duplicateIndex;
      } else {
        if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
          state.usedDuplicates[duplicateIndex] = true;
        }
        if (type === "[object Object]") {
          if (block && Object.keys(state.dump).length !== 0) {
            writeBlockMapping(state, level, state.dump, compact);
            if (duplicate) {
              state.dump = "&ref_" + duplicateIndex + state.dump;
            }
          } else {
            writeFlowMapping(state, level, state.dump);
            if (duplicate) {
              state.dump = "&ref_" + duplicateIndex + " " + state.dump;
            }
          }
        } else if (type === "[object Array]") {
          if (block && state.dump.length !== 0) {
            if (state.noArrayIndent && !isblockseq && level > 0) {
              writeBlockSequence(state, level - 1, state.dump, compact);
            } else {
              writeBlockSequence(state, level, state.dump, compact);
            }
            if (duplicate) {
              state.dump = "&ref_" + duplicateIndex + state.dump;
            }
          } else {
            writeFlowSequence(state, level, state.dump);
            if (duplicate) {
              state.dump = "&ref_" + duplicateIndex + " " + state.dump;
            }
          }
        } else if (type === "[object String]") {
          if (state.tag !== "?") {
            writeScalar(state, state.dump, level, iskey, inblock);
          }
        } else if (type === "[object Undefined]") {
          return false;
        } else {
          if (state.skipInvalid) return false;
          throw new YAMLException("unacceptable kind of an object to dump " + type);
        }
        if (state.tag !== null && state.tag !== "?") {
          tagStr = encodeURI(
            state.tag[0] === "!" ? state.tag.slice(1) : state.tag
          ).replace(/!/g, "%21");
          if (state.tag[0] === "!") {
            tagStr = "!" + tagStr;
          } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
            tagStr = "!!" + tagStr.slice(18);
          } else {
            tagStr = "!<" + tagStr + ">";
          }
          state.dump = tagStr + " " + state.dump;
        }
      }
      return true;
    }
    function getDuplicateReferences(object, state) {
      var objects = [], duplicatesIndexes = [], index, length;
      inspectNode(object, objects, duplicatesIndexes);
      for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
        state.duplicates.push(objects[duplicatesIndexes[index]]);
      }
      state.usedDuplicates = new Array(length);
    }
    function inspectNode(object, objects, duplicatesIndexes) {
      var objectKeyList, index, length;
      if (object !== null && typeof object === "object") {
        index = objects.indexOf(object);
        if (index !== -1) {
          if (duplicatesIndexes.indexOf(index) === -1) {
            duplicatesIndexes.push(index);
          }
        } else {
          objects.push(object);
          if (Array.isArray(object)) {
            for (index = 0, length = object.length; index < length; index += 1) {
              inspectNode(object[index], objects, duplicatesIndexes);
            }
          } else {
            objectKeyList = Object.keys(object);
            for (index = 0, length = objectKeyList.length; index < length; index += 1) {
              inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
            }
          }
        }
      }
    }
    function dump(input, options) {
      options = options || {};
      var state = new State(options);
      if (!state.noRefs) getDuplicateReferences(input, state);
      var value = input;
      if (state.replacer) {
        value = state.replacer.call({ "": value }, "", value);
      }
      if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
      return "";
    }
    module2.exports.dump = dump;
  }
});

// node_modules/js-yaml/index.js
var require_js_yaml = __commonJS({
  "node_modules/js-yaml/index.js"(exports2, module2) {
    "use strict";
    var loader = require_loader();
    var dumper = require_dumper();
    function renamed(from, to) {
      return function() {
        throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
      };
    }
    module2.exports.Type = require_type();
    module2.exports.Schema = require_schema();
    module2.exports.FAILSAFE_SCHEMA = require_failsafe();
    module2.exports.JSON_SCHEMA = require_json();
    module2.exports.CORE_SCHEMA = require_core();
    module2.exports.DEFAULT_SCHEMA = require_default();
    module2.exports.load = loader.load;
    module2.exports.loadAll = loader.loadAll;
    module2.exports.dump = dumper.dump;
    module2.exports.YAMLException = require_exception();
    module2.exports.types = {
      binary: require_binary(),
      float: require_float(),
      map: require_map(),
      null: require_null(),
      pairs: require_pairs(),
      set: require_set(),
      timestamp: require_timestamp(),
      bool: require_bool(),
      int: require_int(),
      merge: require_merge(),
      omap: require_omap(),
      seq: require_seq(),
      str: require_str()
    };
    module2.exports.safeLoad = renamed("safeLoad", "load");
    module2.exports.safeLoadAll = renamed("safeLoadAll", "loadAll");
    module2.exports.safeDump = renamed("safeDump", "dump");
  }
});

// shared/i18n-core.js
var require_i18n_core = __commonJS({
  "shared/i18n-core.js"(exports2, module2) {
    "use strict";
    var MAX_DEPTH = 16;
    var MAX_WORKSHEET_ITEMS = 500;
    var SCAN_MAX_FILES = 200;
    var SCAN_MAX_FILE_BYTES = 2 * 1024 * 1024;
    var SCAN_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
    function stripJsonComments(text) {
      let out = "";
      let hasComments = false;
      let inString = false;
      let escaped = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
          out += ch;
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === "\\") {
            escaped = true;
            continue;
          }
          if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') {
          inString = true;
          out += ch;
          continue;
        }
        if (ch === "/" && text[i + 1] === "/") {
          hasComments = true;
          while (i < text.length && text[i] !== "\n") i++;
          if (i < text.length) {
            out += "\n";
          }
          continue;
        }
        if (ch === "/" && text[i + 1] === "*") {
          hasComments = true;
          i += 2;
          while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
            if (text[i] === "\n") out += "\n";
            i++;
          }
          i++;
          continue;
        }
        out += ch;
      }
      return { code: out, hasComments };
    }
    function stripTrailingCommas(text) {
      let out = "";
      let inString = false;
      let escaped = false;
      let pending = -1;
      for (const ch of text) {
        if (inString) {
          out += ch;
          if (escaped) escaped = false;
          else if (ch === "\\") escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') {
          pending = -1;
          inString = true;
          out += ch;
          continue;
        }
        if (ch === ",") {
          out += ch;
          pending = out.length - 1;
          continue;
        }
        if (ch === "}" || ch === "]") {
          if (pending >= 0) out = out.slice(0, pending) + " " + out.slice(pending + 1);
          pending = -1;
          out += ch;
          continue;
        }
        if (/\s/.test(ch)) {
          out += ch;
          continue;
        }
        pending = -1;
        out += ch;
      }
      return out;
    }
    function isPlainObject(v) {
      return v !== null && typeof v === "object" && !Array.isArray(v);
    }
    function detectIndent(text) {
      const lines = text.split("\n");
      for (const line of lines) {
        const m = line.match(/^([ \t]+)\S/);
        if (m) return m[1][0] === "	" ? "tab" : m[1].length;
      }
      return 2;
    }
    function jsonErrorPositionToLine(text, message) {
      const m = /position (\d+)/i.exec(message);
      if (!m) return null;
      const pos = Math.min(parseInt(m[1], 10), text.length);
      const before = text.slice(0, pos);
      const line = before.split("\n").length;
      const col = pos - before.lastIndexOf("\n");
      return { line, column: col };
    }
    function yamlHasComments(text) {
      let inSingle = false;
      let inDouble = false;
      for (const rawLine of text.split("\n")) {
        inSingle = false;
        inDouble = false;
        for (let i = 0; i < rawLine.length; i++) {
          const ch = rawLine[i];
          if (inSingle) {
            if (ch === "'") inSingle = false;
            continue;
          }
          if (inDouble) {
            if (ch === "\\") {
              i++;
              continue;
            }
            if (ch === '"') inDouble = false;
            continue;
          }
          if (ch === "'") {
            inSingle = true;
            continue;
          }
          if (ch === '"') {
            inDouble = true;
            continue;
          }
          if (ch === "#" && (i === 0 || /\s/.test(rawLine[i - 1]))) return true;
        }
      }
      return false;
    }
    function parseLocaleText(text, ext, opts = {}) {
      const e = String(ext || "").toLowerCase();
      const trailingNewline = /\n\s*$/.test(text) || text.endsWith("\n");
      if (e === ".json") {
        let data;
        try {
          data = JSON.parse(text);
        } catch (err) {
          const at = jsonErrorPositionToLine(text, String(err && err.message));
          const e2 = new Error("JSON \u89E3\u6790\u5931\u8D25\uFF1A" + String(err && err.message).replace(/^JSON\.parse: /, "") + (at ? `\uFF08\u7B2C ${at.line} \u884C\u7B2C ${at.column} \u5217\u9644\u8FD1\uFF09` : ""));
          e2.line = at && at.line;
          throw e2;
        }
        if (!isPlainObject(data)) throw new Error("locale \u6839\u5FC5\u987B\u662F\u5BF9\u8C61\uFF08\u5F97\u5230 " + (Array.isArray(data) ? "\u6570\u7EC4" : typeof data) + "\uFF09");
        return { data, format: "json", indent: detectIndent(text), trailingNewline, hasComments: false };
      }
      if (e === ".jsonc") {
        const stripped = stripJsonComments(text);
        const code = stripTrailingCommas(stripped.code);
        let data;
        try {
          data = JSON.parse(code);
        } catch (err) {
          const at = jsonErrorPositionToLine(code, String(err && err.message));
          throw new Error("JSONC \u89E3\u6790\u5931\u8D25\uFF1A" + String(err && err.message) + (at ? `\uFF08\u7B2C ${at.line} \u884C\u9644\u8FD1\uFF09` : "") + "\uFF08\u6CE8\u91CA/\u5C3E\u9017\u53F7\u5DF2\u5265\u9664\u540E\u89E3\u6790\uFF09");
        }
        if (!isPlainObject(data)) throw new Error("locale \u6839\u5FC5\u987B\u662F\u5BF9\u8C61\uFF08\u5F97\u5230 " + (Array.isArray(data) ? "\u6570\u7EC4" : typeof data) + "\uFF09");
        return { data, format: "jsonc", indent: detectIndent(text), trailingNewline, hasComments: stripped.hasComments };
      }
      if (e === ".yaml" || e === ".yml") {
        if (typeof opts.yamlLoad !== "function") throw new Error("YAML \u89E3\u6790\u5668\u672A\u6CE8\u5165\uFF08service/MCP \u5DF2\u5185\u7F6E js-yaml\uFF1B\u7EAF\u524D\u7AEF\u73AF\u5883\u8BF7\u7528 JSON\uFF09");
        let data;
        try {
          data = opts.yamlLoad(text);
        } catch (err) {
          const mark = err && err.mark;
          throw new Error("YAML \u89E3\u6790\u5931\u8D25\uFF1A" + String(err && err.reason || err && err.message || err) + (mark ? `\uFF08\u7B2C ${(mark.line || 0) + 1} \u884C\u9644\u8FD1\uFF09` : ""));
        }
        if (!isPlainObject(data)) throw new Error("locale \u6839\u5FC5\u987B\u662F\u5BF9\u8C61\uFF08\u5F97\u5230 " + (Array.isArray(data) ? "\u6570\u7EC4" : typeof data) + "\uFF09");
        return { data, format: "yaml", indent: 2, trailingNewline, hasComments: yamlHasComments(text) };
      }
      throw new Error(`\u4E0D\u652F\u6301\u7684\u683C\u5F0F\uFF1A${ext}\uFF08\u652F\u6301 .json/.jsonc/.yaml/.yml\uFF09`);
    }
    function serializeLocale(data, meta, opts = {}) {
      const newline = meta && meta.trailingNewline ? "\n" : "";
      if (meta && meta.format === "yaml") {
        if (typeof opts.yamlDump !== "function") throw new Error("YAML \u5E8F\u5217\u5316\u5668\u672A\u6CE8\u5165");
        return opts.yamlDump(data, { indent: typeof meta.indent === "number" ? meta.indent : 2, lineWidth: -1, noRefs: true }) + newline;
      }
      const indent = meta && meta.indent === "tab" ? "	" : typeof (meta && meta.indent) === "number" ? meta.indent : 2;
      return JSON.stringify(data, null, indent) + newline;
    }
    function flattenLocale(root) {
      const map = /* @__PURE__ */ Object.create(null);
      const order = [];
      const conflicts = [];
      const insert = (path2, value) => {
        if (Object.prototype.hasOwnProperty.call(map, path2)) {
          conflicts.push(path2);
          delete map[path2];
          const idx = order.indexOf(path2);
          if (idx >= 0) order.splice(idx, 1);
          return;
        }
        map[path2] = value;
        order.push(path2);
      };
      const walk = (node, prefix, depth) => {
        if (depth > MAX_DEPTH) return;
        for (const key of Object.keys(node)) {
          const val = node[key];
          const path2 = prefix ? prefix + "." + key : key;
          if (isPlainObject(val)) walk(val, path2, depth + 1);
          else insert(path2, val);
        }
      };
      walk(root, "", 0);
      return { map, order, conflicts: [...new Set(conflicts)] };
    }
    function extractPlaceholders(str) {
      if (typeof str !== "string") return { named: [], positionalCounts: {} };
      const cleaned = str.replace(/%%/g, "");
      const named = /* @__PURE__ */ new Set();
      const positional = /* @__PURE__ */ Object.create(null);
      for (const m of cleaned.matchAll(/\{\{([^{}]+)\}\}/g)) {
        const name = m[1].trim();
        if (name) named.add(name);
      }
      let depth = 0;
      let head = "";
      for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (ch === "{") {
          depth++;
          if (depth === 1) head = "";
          continue;
        }
        if (ch === "}") {
          const wasDepth1 = depth === 1;
          if (depth > 0) depth--;
          if (wasDepth1) {
            const h = head.split(",")[0].trim();
            if (h && !/\s/.test(h)) {
              named.add(/^\d+$/.test(h) ? "{" + h + "}" : h);
            }
            head = "";
          }
          continue;
        }
        if (depth === 1) head += ch;
      }
      for (const m of cleaned.matchAll(/%(?:\d+\$)?[sdif@]/g)) {
        positional[m[0]] = (positional[m[0]] || 0) + 1;
      }
      return { named: [...named], positionalCounts: positional };
    }
    function comparePlaceholders(baseValue, targetValue) {
      const b = extractPlaceholders(baseValue);
      const t = extractPlaceholders(targetValue);
      const missingInTarget = b.named.filter((n) => !t.named.includes(n));
      const extraInTarget = t.named.filter((n) => !b.named.includes(n));
      const positionalIssues = [];
      const directives = /* @__PURE__ */ new Set([...Object.keys(b.positionalCounts), ...Object.keys(t.positionalCounts)]);
      for (const d of directives) {
        const bc = b.positionalCounts[d] || 0;
        const tc = t.positionalCounts[d] || 0;
        if (bc !== tc) positionalIssues.push(`${d} \u57FA\u51C6\xD7${bc} \u76EE\u6807\xD7${tc}`);
      }
      return {
        ok: missingInTarget.length === 0 && extraInTarget.length === 0 && positionalIssues.length === 0,
        missingInTarget,
        extraInTarget,
        positionalIssues
      };
    }
    var NON_TRANSLATABLE_RE = /^[\s\d\p{P}\p{S}]+$/u;
    function looksUntranslated(baseValue, targetValue) {
      if (typeof baseValue !== "string" || typeof targetValue !== "string") return false;
      if (baseValue.length === 0 || baseValue !== targetValue) return false;
      return !NON_TRANSLATABLE_RE.test(baseValue);
    }
    function compareLocaleSets(baseFlat, targetFlat) {
      const missing = [];
      const extra = [];
      const emptyValues = [];
      const sameAsBase = [];
      const placeholderIssues = [];
      for (const key of baseFlat.order) {
        const baseValue = baseFlat.map[key];
        if (!Object.prototype.hasOwnProperty.call(targetFlat.map, key)) {
          missing.push({ key, baseValue });
          continue;
        }
        const tv = targetFlat.map[key];
        if (tv === "" || tv === null) {
          emptyValues.push({ key, baseValue });
          continue;
        }
        if (looksUntranslated(String(baseValue), String(tv))) {
          sameAsBase.push({ key, baseValue });
          continue;
        }
        if (typeof baseValue === "string" && typeof tv === "string") {
          const ph = comparePlaceholders(baseValue, tv);
          if (!ph.ok) placeholderIssues.push({ key, detail: ph });
        }
      }
      for (const key of targetFlat.order) {
        if (!Object.prototype.hasOwnProperty.call(baseFlat.map, key)) extra.push({ key, value: targetFlat.map[key] });
      }
      return { missing, extra, emptyValues, sameAsBase, placeholderIssues };
    }
    function buildWorksheet(parity, { limit = 200, includeSame = false } = {}) {
      const items = [];
      let skipped = 0;
      const push = (key, baseValue) => {
        if (items.length >= Math.min(limit, MAX_WORKSHEET_ITEMS)) {
          skipped++;
          return;
        }
        if (typeof baseValue === "string") items.push({ k: key, v: baseValue });
        else skipped++;
      };
      for (const m of parity.missing) push(m.key, m.baseValue);
      for (const m of parity.emptyValues) push(m.key, m.baseValue);
      if (includeSame) for (const m of parity.sameAsBase) push(m.key, m.baseValue);
      return { items, skipped };
    }
    function clonePlain(value) {
      if (isPlainObject(value)) {
        const out = {};
        for (const k of Object.keys(value)) out[k] = clonePlain(value[k]);
        return out;
      }
      return value;
    }
    function getByPath(doc, path2) {
      let node = doc;
      for (const seg of String(path2).split(".")) {
        if (!isPlainObject(node)) return void 0;
        if (!Object.prototype.hasOwnProperty.call(node, seg)) return void 0;
        node = node[seg];
      }
      return node;
    }
    function setByPath(doc, path2, value) {
      const segs = String(path2).split(".");
      let node = doc;
      for (let i = 0; i < segs.length - 1; i++) {
        const seg = segs[i];
        if (!isPlainObject(node[seg])) node[seg] = {};
        node = node[seg];
      }
      node[segs[segs.length - 1]] = value;
    }
    function planApply({ targetDoc, baseFlat, translations, mode = "preserve", targetConflicts = [], allowPlaceholderMismatch = false }) {
      const conflictSet = new Set(targetConflicts);
      const plan = { insert: [], update: [], noop: [], unknown: [], errors: [], warnings: [] };
      const clean = /* @__PURE__ */ Object.create(null);
      for (const [rawKey, rawValue] of Object.entries(translations || {})) {
        const key = String(rawKey).trim();
        if (!key) continue;
        if (conflictSet.has(key)) {
          plan.errors.push({ key, reason: "\u7ED3\u6784\u51B2\u7A81\u952E\uFF08\u5D4C\u5957\u8DEF\u5F84\u4E0E\u5B57\u9762\u952E\u76F8\u649E\uFF09\uFF0C\u62D2\u7EDD\u5199\u5165" });
          continue;
        }
        const inBase = Object.prototype.hasOwnProperty.call(baseFlat.map, key);
        const inTarget = getByPath(targetDoc, key) !== void 0;
        if (!inBase && !inTarget) {
          plan.unknown.push(key);
          continue;
        }
        if (inBase) {
          const baseValue = baseFlat.map[key];
          if (typeof rawValue !== "string") {
            plan.errors.push({ key, reason: "\u8BD1\u6587\u5FC5\u987B\u662F\u5B57\u7B26\u4E32\uFF08\u975E\u5B57\u7B26\u4E32\u952E\u4E0D\u53C2\u4E0E\u7FFB\u8BD1\uFF09" });
            continue;
          }
          if (typeof baseValue === "string") {
            const ph = comparePlaceholders(baseValue, rawValue);
            if (!ph.ok) {
              const why = [
                ph.missingInTarget.length ? `\u7F3A\u5C11 ${ph.missingInTarget.join(" ")}` : "",
                ph.extraInTarget.length ? `\u591A\u51FA ${ph.extraInTarget.join(" ")}` : "",
                ph.positionalIssues.length ? ph.positionalIssues.join("; ") : ""
              ].filter(Boolean).join("\uFF1B");
              if (allowPlaceholderMismatch) {
                plan.warnings.push({ key, reason: `\u5360\u4F4D\u7B26\u4E0D\u4E00\u81F4\uFF08force \u653E\u884C\uFF09\uFF1A${why}` });
              } else {
                plan.errors.push({ key, reason: `\u5360\u4F4D\u7B26\u4E0D\u4E00\u81F4\uFF1A${why}` });
                continue;
              }
            }
          }
          clean[key] = rawValue;
        } else {
          if (typeof rawValue !== "string") {
            plan.errors.push({ key, reason: "\u8BD1\u6587\u5FC5\u987B\u662F\u5B57\u7B26\u4E32" });
            continue;
          }
          clean[key] = rawValue;
        }
      }
      const newDoc = clonePlain(targetDoc);
      for (const [key, value] of Object.entries(clean)) {
        const cur = getByPath(newDoc, key);
        if (cur === void 0) {
          setByPath(newDoc, key, value);
          plan.insert.push(key);
        } else if (cur === value) {
          plan.noop.push(key);
        } else {
          setByPath(newDoc, key, value);
          plan.update.push(key);
        }
      }
      if (mode === "mirror") rebuildMirrorDoc(newDoc, baseFlat);
      return { newDoc, plan };
    }
    var _rankIndex = [];
    function rebuildMirrorAt(node, prefix) {
      if (!isPlainObject(node)) return;
      const rankOf = (childKey) => {
        const p = prefix ? prefix + "." + childKey : childKey;
        let best = Infinity;
        for (const [k, i] of _rankIndex) {
          if (k === p || k.startsWith(p + ".")) {
            if (i < best) best = i;
          }
        }
        return best;
      };
      const keys = Object.keys(node);
      const unknownSeq = keys.filter((k) => rankOf(k) === Infinity);
      const unknownRank = new Map(unknownSeq.map((k, i) => [k, _rankIndex.length + i]));
      const decorated = keys.map((k) => ({ k, r: rankOf(k) === Infinity ? unknownRank.get(k) : rankOf(k) }));
      decorated.sort((a, b) => a.r - b.r);
      const rebuilt = {};
      for (const d of decorated) rebuilt[d.k] = node[d.k];
      for (const k of Object.keys(rebuilt)) {
        if (isPlainObject(rebuilt[k])) rebuildMirrorAt(rebuilt[k], prefix ? prefix + "." + k : k);
      }
      for (const k of keys) delete node[k];
      Object.assign(node, rebuilt);
    }
    function rebuildMirrorDoc(doc, baseFlat) {
      _rankIndex = baseFlat.order.map((k, i) => [k, i]);
      rebuildMirrorAt(doc, "");
    }
    function normalizeLocaleTag(s) {
      return String(s || "").trim().replace(/_/g, "-").toLowerCase();
    }
    function isLocaleTag(s) {
      return /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(normalizeLocaleTag(s));
    }
    var LOCALE_EXTS = /* @__PURE__ */ new Set([".json", ".jsonc", ".yaml", ".yml"]);
    function classifyLocalePaths(relPaths) {
      const files = [];
      const ambiguous = [];
      let countA = 0;
      let countB = 0;
      for (const rel of relPaths) {
        const norm = rel.replace(/\\/g, "/");
        const base = norm.slice(norm.lastIndexOf("/") + 1);
        const dot = base.lastIndexOf(".");
        if (dot <= 0) continue;
        const stem = base.slice(0, dot);
        const ext = base.slice(dot).toLowerCase();
        if (!LOCALE_EXTS.has(ext)) continue;
        const parent = norm.includes("/") ? norm.slice(0, norm.lastIndexOf("/")) : "";
        const parentStem = parent.includes("/") ? parent.slice(parent.lastIndexOf("/") + 1) : parent;
        if (parentStem && isLocaleTag(parentStem)) {
          files.push({ relPath: norm, locale: normalizeLocaleTag(parentStem), ns: stem, ext });
          countB++;
        } else if (isLocaleTag(stem)) {
          files.push({ relPath: norm, locale: normalizeLocaleTag(stem), ns: parent || "", ext });
          countA++;
        } else {
          ambiguous.push(norm);
        }
      }
      const layout = countA && countB ? "mixed" : countA ? "file-per-locale" : countB ? "dir-per-locale" : "none";
      const locales = [...new Set(files.map((f) => f.locale))].sort();
      const nsList = [...new Set(files.map((f) => f.ns))].sort();
      return { layout, files, locales, nsList, ambiguous };
    }
    function inferBaseLocale(locales, explicit) {
      if (explicit) return normalizeLocaleTag(explicit);
      if (!locales.length) return "";
      const zh = locales.find((l) => l === "zh" || l.startsWith("zh-"));
      if (zh) return zh;
      const en = locales.find((l) => l === "en" || l.startsWith("en-"));
      if (en) return en;
      return locales[0];
    }
    function buildParityMatrix(parsedFiles, baseLocale) {
      const byNs = /* @__PURE__ */ new Map();
      const allLocales = /* @__PURE__ */ new Set();
      for (const f of parsedFiles) {
        if (!byNs.has(f.ns)) byNs.set(f.ns, /* @__PURE__ */ new Map());
        const localeMap = byNs.get(f.ns);
        const flat = f.parse && f.parse.data !== void 0 ? flattenLocale(f.parse.data) : null;
        localeMap.set(f.locale, { file: f, flat });
        allLocales.add(f.locale);
      }
      const matrix = {};
      const totals = { missing: 0, extra: 0, empty: 0, sameAsBase: 0, placeholder: 0, parseErrors: 0, files: parsedFiles.length };
      for (const [ns, localeMap] of byNs) {
        const baseEntry = localeMap.get(baseLocale);
        matrix[ns] = {};
        if (!baseEntry || !baseEntry.flat) {
          matrix[ns]._error = `\u57FA\u51C6\u8BED\u8A00 ${baseLocale} \u7F3A\u5931\u6216\u89E3\u6790\u5931\u8D25`;
          continue;
        }
        for (const locale of allLocales) {
          if (locale === baseLocale) continue;
          const entry = localeMap.get(locale);
          if (!entry) {
            const missing = baseEntry.flat.order.map((key) => ({ key, baseValue: baseEntry.flat.map[key] }));
            matrix[ns][locale] = { fileMissing: true, missing, extra: [], emptyValues: [], sameAsBase: [], placeholderIssues: [] };
            totals.missing += missing.length;
            continue;
          }
          if (!entry.flat) {
            matrix[ns][locale] = { _parseError: true };
            totals.parseErrors++;
            continue;
          }
          const cmp = compareLocaleSets(baseEntry.flat, entry.flat);
          const conflicts = entry.flat.conflicts.length || baseEntry.flat.conflicts.length ? { structuralConflicts: [.../* @__PURE__ */ new Set([...baseEntry.flat.conflicts, ...entry.flat.conflicts])] } : {};
          matrix[ns][locale] = {
            missing: cmp.missing,
            extra: cmp.extra,
            emptyValues: cmp.emptyValues,
            sameAsBase: cmp.sameAsBase,
            placeholderIssues: cmp.placeholderIssues,
            ...conflicts
          };
          totals.missing += cmp.missing.length;
          totals.extra += cmp.extra.length;
          totals.empty += cmp.emptyValues.length;
          totals.sameAsBase += cmp.sameAsBase.length;
          totals.placeholder += cmp.placeholderIssues.length;
        }
      }
      return { matrix, totals, nsList: [...byNs.keys()].sort() };
    }
    function oneLine(s, n = 120) {
      const str = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
      return str.length > n ? str.slice(0, n - 1) + "\u2026" : str;
    }
    function renderStatusReport(root, baseLocale, layout, nsList, locales, matrix, totals, ambiguous) {
      const lines = [];
      lines.push(`i18n \u4F53\u68C0\uFF1A${root}`);
      lines.push(`\u5E03\u5C40\uFF1A${layout} \xB7 \u57FA\u51C6\u8BED\u8A00\uFF1A${baseLocale} \xB7 \u8BED\u8A00\uFF1A${locales.join(", ") || "\uFF08\u65E0\uFF09"}`);
      lines.push(`\u547D\u540D\u7A7A\u95F4\uFF1A${nsList.length ? nsList.join(", ") : "\uFF08\u65E0\uFF09"} \xB7 \u6587\u4EF6 ${totals.files} \u4E2A\uFF08\u89E3\u6790\u5931\u8D25 ${totals.parseErrors}\uFF09`);
      if (ambiguous && ambiguous.length) {
        lines.push(`\u26A0 ${ambiguous.length} \u4E2A\u6587\u4EF6\u65E0\u6CD5\u8BC6\u522B\u8BED\u8A00\u5F52\u5C5E\uFF08\u6587\u4EF6\u540D\u4E0E\u76EE\u5F55\u540D\u90FD\u4E0D\u50CF locale \u6807\u7B7E\uFF09\uFF1A`);
        for (const a of ambiguous.slice(0, 5)) lines.push(`  - ${a}`);
        if (ambiguous.length > 5) lines.push(`  - \u2026\u7B49 ${ambiguous.length} \u4E2A`);
      }
      let hasIssue = false;
      for (const ns of nsList) {
        const entry = matrix[ns];
        if (!entry || entry._error) {
          if (entry && entry._error) lines.push(`[${ns}] ${entry._error}`);
          continue;
        }
        for (const locale of Object.keys(entry)) {
          const c = entry[locale];
          if (!c || c._parseError) {
            lines.push(`[${ns}] ${locale}: \u89E3\u6790\u5931\u8D25`);
            continue;
          }
          const n = c.missing.length + c.emptyValues.length + c.sameAsBase.length + c.placeholderIssues.length;
          if (!n) continue;
          hasIssue = true;
          lines.push(`[${ns}] ${locale}${c.fileMissing ? "\uFF08\u6587\u4EF6\u7F3A\u5931\uFF09" : ""}: \u7F3A\u5931 ${c.missing.length} \xB7 \u7A7A\u503C ${c.emptyValues.length} \xB7 \u7591\u4F3C\u672A\u7FFB\u8BD1 ${c.sameAsBase.length} \xB7 \u5360\u4F4D\u7B26\u4E0D\u4E00\u81F4 ${c.placeholderIssues.length}${c.structuralConflicts ? ` \xB7 \u7ED3\u6784\u51B2\u7A81 ${c.structuralConflicts.length}` : ""}`);
          for (const m of c.missing.slice(0, 8)) lines.push(`    - ${m.key} = ${oneLine(JSON.stringify(m.baseValue), 80)}`);
          if (c.missing.length > 8) lines.push(`    - \u2026\u7B49 ${c.missing.length} \u4E2A\u7F3A\u5931\u952E`);
        }
      }
      if (!hasIssue) lines.push("\u2705 \u6240\u6709\u8BED\u8A00\u4E0E\u57FA\u51C6\u5BF9\u9F50\uFF0C\u672A\u53D1\u73B0\u95EE\u9898\u3002");
      else lines.push(`\u5408\u8BA1\uFF1A\u7F3A\u5931 ${totals.missing} \xB7 \u7A7A\u503C ${totals.empty} \xB7 \u7591\u4F3C\u672A\u7FFB\u8BD1 ${totals.sameAsBase} \xB7 \u5360\u4F4D\u7B26\u4E0D\u4E00\u81F4 ${totals.placeholder}`);
      lines.push("\u4E0B\u4E00\u6B65\uFF1Ai18n_missing {dir, locale} \u83B7\u53D6\u67D0\u8BED\u8A00\u7684\u5F85\u7FFB\u8BD1\u6E05\u5355\uFF08\u81EA\u52A8\u5E26\u672F\u8BED\u8868\uFF09\uFF0C\u7FFB\u8BD1\u540E i18n_apply \u843D\u76D8\uFF08\u9700 confirm\uFF09\u3002");
      return lines.join("\n");
    }
    function renderMissingWorksheet(root, baseLocale, locale, ns, worksheet, glossary) {
      const lines = [];
      lines.push(`\u5F85\u7FFB\u8BD1\u5DE5\u4F5C\u8868\uFF1A${baseLocale} \u2192 ${locale}${ns ? `\uFF08ns=${ns}\uFF09` : "\uFF08\u5168\u90E8 ns\uFF09"}\uFF0C\u5171 ${worksheet.items.length} \u9879${worksheet.skipped ? `\uFF08\u8D85\u9650\u622A\u65AD ${worksheet.skipped} \u9879\uFF0C\u5206\u6279\u5904\u7406\uFF09` : ""}`);
      if (glossary && Object.keys(glossary).length) {
        lines.push("\u672F\u8BED\u8868\uFF08\u8BD1\u6587\u5FC5\u987B\u9075\u5B88\uFF09\uFF1A");
        for (const [k, v] of Object.entries(glossary).slice(0, 50)) lines.push(`  ${k} \u2192 ${v}`);
      } else {
        lines.push("\u672F\u8BED\u8868\uFF1A\u672A\u8BBE\u7F6E\uFF08i18n_glossary action=set \u53EF\u914D\u7F6E\uFF0C\u7FFB\u8BD1\u524D\u5EFA\u8BAE\u5148\u7EF4\u62A4\u672F\u8BED\uFF09");
      }
      lines.push("```json");
      lines.push(JSON.stringify(worksheet.items));
      lines.push("```");
      lines.push(`\u7FFB\u8BD1\u8981\u6C42\uFF1A\u76EE\u6807\u8BED\u8A00=${locale}\uFF1B\u5360\u4F4D\u7B26\uFF08{name}\u3001{{name}}\u3001{0}\u3001%s\u3001%1$s \u7B49\uFF09\u5FC5\u987B\u539F\u6837\u4FDD\u7559\u4E14\u6570\u91CF\u4E00\u81F4\uFF1B\u4E0D\u8981\u53D1\u660E\u6E05\u5355\u4E4B\u5916\u7684\u952E\u3002`);
      lines.push(`\u5B8C\u6210\u540E\u8C03\u7528 i18n_apply\uFF1Adir="${root}", locale="${locale}"${ns ? `, ns="${ns}"` : ""}, translations={<key>: <\u8BD1\u6587>}, confirm=true`);
      return lines.join("\n");
    }
    module2.exports = {
      MAX_DEPTH,
      MAX_WORKSHEET_ITEMS,
      SCAN_MAX_FILES,
      SCAN_MAX_FILE_BYTES,
      SCAN_MAX_TOTAL_BYTES,
      stripJsonComments,
      stripTrailingCommas,
      parseLocaleText,
      serializeLocale,
      isPlainObject,
      detectIndent,
      flattenLocale,
      extractPlaceholders,
      comparePlaceholders,
      looksUntranslated,
      compareLocaleSets,
      buildWorksheet,
      planApply,
      rebuildMirrorDoc,
      normalizeLocaleTag,
      isLocaleTag,
      classifyLocalePaths,
      inferBaseLocale,
      buildParityMatrix,
      renderStatusReport,
      renderMissingWorksheet,
      oneLine
    };
  }
});

// shared/scan-engine.js
var require_scan_engine = __commonJS({
  "shared/scan-engine.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var path2 = require("path");
    var core2 = require_i18n_core();
    var SKIP_DIRS = /* @__PURE__ */ new Set([
      "node_modules",
      ".git",
      ".svn",
      ".hg",
      ".next",
      ".nuxt",
      ".output",
      "target",
      "coverage",
      ".turbo",
      ".cache",
      "Pods",
      "Carthage"
    ]);
    function walkLocaleFiles(rootDir, caps = {}) {
      const maxFiles = caps.maxFiles || core2.SCAN_MAX_FILES;
      const maxFileBytes = caps.maxFileBytes || core2.SCAN_MAX_FILE_BYTES;
      const maxTotal = caps.maxTotalBytes || core2.SCAN_MAX_TOTAL_BYTES;
      const maxDepth = caps.maxDepth || 8;
      const found = [];
      const warnings = [];
      let totalBytes = 0;
      let truncated = false;
      const visit = (dir, depth) => {
        if (truncated || depth > maxDepth) return;
        let entries;
        try {
          entries = fs2.readdirSync(dir, { withFileTypes: true });
        } catch (e) {
          warnings.push(`\u76EE\u5F55\u4E0D\u53EF\u8BFB\uFF1A${dir}\uFF08${e.message}\uFF09`);
          return;
        }
        for (const ent of entries) {
          if (truncated) return;
          const full = path2.join(dir, ent.name);
          if (ent.isDirectory()) {
            if (SKIP_DIRS.has(ent.name)) continue;
            visit(full, depth + 1);
            continue;
          }
          if (!ent.isFile()) continue;
          const ext = path2.extname(ent.name).toLowerCase();
          if (ext !== ".json" && ext !== ".jsonc" && ext !== ".yaml" && ext !== ".yml") continue;
          let st;
          try {
            st = fs2.statSync(full);
          } catch (_) {
            continue;
          }
          if (st.size > maxFileBytes) {
            warnings.push(`\u8DF3\u8FC7\u8D85\u5927\u6587\u4EF6\uFF08${st.size} \u5B57\u8282 > ${maxFileBytes}\uFF09\uFF1A${path2.relative(rootDir, full)}`);
            continue;
          }
          if (found.length >= maxFiles) {
            truncated = true;
            warnings.push(`\u6587\u4EF6\u6570\u8FBE\u4E0A\u9650 ${maxFiles}\uFF0C\u626B\u63CF\u622A\u65AD`);
            return;
          }
          if (totalBytes + st.size > maxTotal) {
            truncated = true;
            warnings.push(`\u603B\u5B57\u8282\u6570\u8FBE\u4E0A\u9650 ${maxTotal}\uFF0C\u626B\u63CF\u622A\u65AD`);
            return;
          }
          found.push({ absPath: full, relPath: path2.relative(rootDir, full), size: st.size });
          totalBytes += st.size;
        }
      };
      visit(rootDir, 0);
      return { found, warnings, truncated };
    }
    function scanDir(rootDir, opts = {}) {
      const yaml2 = opts.yaml || null;
      const rootStat = fs2.statSync(rootDir);
      if (!rootStat.isDirectory()) throw new Error(`\u4E0D\u662F\u76EE\u5F55\uFF1A${rootDir}`);
      const { found, warnings, truncated } = walkLocaleFiles(rootDir);
      const classify = core2.classifyLocalePaths(found.map((f) => f.relPath));
      const parsedFiles = [];
      const parseErrors = [];
      let totalBytes = 0;
      for (const f of classify.files) {
        const meta = found.find((x) => x.relPath === f.relPath);
        const abs = path2.join(rootDir, f.relPath);
        let text;
        try {
          text = fs2.readFileSync(abs, "utf8");
        } catch (e) {
          parseErrors.push({ relPath: f.relPath, error: `\u8BFB\u53D6\u5931\u8D25\uFF1A${e.message}` });
          continue;
        }
        totalBytes += meta ? meta.size : Buffer.byteLength(text);
        try {
          const parse = core2.parseLocaleText(text, f.ext, { yamlLoad: yaml2 && yaml2.load });
          parsedFiles.push({ relPath: f.relPath, absPath: abs, locale: f.locale, ns: f.ns, ext: f.ext, size: meta ? meta.size : 0, parse });
        } catch (e) {
          parseErrors.push({ relPath: f.relPath, error: e.message });
        }
      }
      const baseLocale = core2.inferBaseLocale(classify.locales, opts.baseLocale);
      const { matrix, totals, nsList } = core2.buildParityMatrix(parsedFiles, baseLocale);
      totals.parseErrors = parseErrors.length;
      totals.files = parsedFiles.length + parseErrors.length;
      const VCAP = 300;
      for (const ns of Object.keys(matrix)) {
        const entry = matrix[ns];
        if (!entry || entry._error) continue;
        for (const locale of Object.keys(entry)) {
          const c = entry[locale];
          if (!c || c._parseError) continue;
          for (const m of c.missing) {
            if (typeof m.baseValue === "string" && m.baseValue.length > VCAP) {
              m.baseValue = m.baseValue.slice(0, VCAP - 1) + "\u2026";
              m.truncated = true;
            }
          }
        }
      }
      return {
        root: rootDir,
        layout: classify.layout,
        baseLocale,
        locales: classify.locales,
        nsList,
        files: parsedFiles.map((f) => ({ relPath: f.relPath, locale: f.locale, ns: f.ns, ext: f.ext, size: f.size, keys: Object.keys(core2.flattenLocale(f.parse.data).map).length, hasComments: f.parse.hasComments, format: f.parse.format })),
        // 完整解析条目：apply-engine 内部用（含 parse/absPath）；HTTP 面板响应须剔除（见 service）
        entries: parsedFiles,
        matrix,
        totals,
        parseErrors,
        ambiguous: classify.ambiguous,
        warnings,
        truncated,
        scannedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    function undoDir(appConfigDir) {
      const d = path2.join(appConfigDir || ".", "i18n-sync-undo");
      fs2.mkdirSync(d, { recursive: true });
      return d;
    }
    function safeFileToken(absPath) {
      return absPath.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-160);
    }
    function writeSnapshot(appConfigDir, batchId, items) {
      const dir = undoDir(appConfigDir);
      const file = path2.join(dir, `${batchId}.json`);
      const payload = {
        batchId,
        at: (/* @__PURE__ */ new Date()).toISOString(),
        items: items.map((it) => ({ absPath: it.absPath, token: safeFileToken(it.absPath), beforeText: it.beforeText, afterText: it.afterText }))
      };
      fs2.writeFileSync(file, JSON.stringify(payload), "utf8");
      return { batchId, file };
    }
    function restoreSnapshot(appConfigDir, batchId) {
      const file = path2.join(undoDir(appConfigDir), `${String(batchId).replace(/[^\w.-]/g, "")}.json`);
      if (!fs2.existsSync(file)) throw new Error(`\u5FEB\u7167\u4E0D\u5B58\u5728\uFF1A${batchId}\uFF08\u53EF\u80FD\u5DF2\u88AB\u6E05\u7406\uFF09`);
      const payload = JSON.parse(fs2.readFileSync(file, "utf8"));
      const results = [];
      for (const it of payload.items) {
        let current;
        try {
          current = fs2.readFileSync(it.absPath, "utf8");
        } catch (e) {
          results.push({ file: it.absPath, ok: false, error: `\u8BFB\u53D6\u5931\u8D25\uFF1A${e.message}` });
          continue;
        }
        if (current !== it.afterText) {
          results.push({ file: it.absPath, ok: false, error: "\u6587\u4EF6\u5728\u5E94\u7528\u540E\u53C8\u88AB\u4FEE\u6539\u8FC7\uFF0C\u62D2\u7EDD\u76F2\u76EE\u64A4\u9500\uFF08\u8BF7\u624B\u5DE5\u6BD4\u5BF9\uFF09" });
          continue;
        }
        fs2.writeFileSync(it.absPath, it.beforeText, "utf8");
        results.push({ file: it.absPath, ok: true });
      }
      return { batchId: payload.batchId, at: payload.at, results };
    }
    function pruneSnapshots(appConfigDir, keep = 20) {
      const dir = undoDir(appConfigDir);
      let files;
      try {
        files = fs2.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
          const full = path2.join(dir, f);
          return { full, m: fs2.statSync(full).mtimeMs };
        });
      } catch (_) {
        return;
      }
      files.sort((a, b) => b.m - a.m);
      for (const f of files.slice(keep)) {
        try {
          fs2.unlinkSync(f.full);
        } catch (_) {
        }
      }
    }
    module2.exports = { walkLocaleFiles, scanDir, writeSnapshot, restoreSnapshot, pruneSnapshots, safeFileToken, SKIP_DIRS };
  }
});

// shared/apply-engine.js
var require_apply_engine = __commonJS({
  "shared/apply-engine.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var path2 = require("path");
    var crypto2 = require("crypto");
    var core2 = require_i18n_core();
    var engine2 = require_scan_engine();
    var KEY_UNDO_INDEX2 = "i18n.undo.index";
    async function applyTranslations2(p) {
      const { yaml: yaml2, appConfigDir, kv: kv2, log: log2 = () => {
      } } = p;
      const dir = String(p.dir || "").trim();
      if (!dir) throw new Error("\u7F3A\u5C11 dir\uFF08locale \u6839\u76EE\u5F55\uFF09");
      const resolvedDir = path2.resolve(dir);
      if (!fs2.existsSync(resolvedDir)) throw new Error(`\u76EE\u5F55\u4E0D\u5B58\u5728\uFF1A${resolvedDir}`);
      const locale = core2.normalizeLocaleTag(p.locale || "");
      if (!locale) throw new Error("\u7F3A\u5C11 locale\uFF08\u76EE\u6807\u8BED\u8A00\uFF0C\u5982 en\uFF09");
      const translations = p.translations;
      if (!translations || typeof translations !== "object" || Array.isArray(translations)) {
        throw new Error("\u7F3A\u5C11 translations\uFF08{ \u952E: \u8BD1\u6587 } \u5BF9\u8C61\uFF09");
      }
      const mode = p.mode === "mirror" ? "mirror" : "preserve";
      const nsFilter = typeof p.ns === "string" && p.ns ? p.ns : null;
      const scan = engine2.scanDir(resolvedDir, { baseLocale: p.baseLocale, yaml: yaml2 });
      const baseLoc = scan.baseLocale;
      if (locale === baseLoc) throw new Error(`locale \u4E0D\u80FD\u7B49\u4E8E\u57FA\u51C6\u8BED\u8A00\uFF08${baseLoc}\uFF09\uFF1B\u57FA\u51C6\u8BED\u8A00\u662F\u7FFB\u8BD1\u6E90\uFF0C\u4E0D\u9700\u8981\u8865\u9F50\u81EA\u5DF1`);
      const filesByNs = /* @__PURE__ */ new Map();
      for (const f of scan.entries) {
        if (!filesByNs.has(f.ns)) filesByNs.set(f.ns, /* @__PURE__ */ new Map());
        filesByNs.get(f.ns).set(f.locale, f);
      }
      const units = [];
      const skippedNs = [];
      const parseErrorHint = (loc) => {
        for (const pe of scan.parseErrors) {
          const norm = pe.relPath.replace(/\\/g, "/");
          const stem = norm.slice(norm.lastIndexOf("/") + 1, norm.lastIndexOf("."));
          const parent = norm.includes("/") ? norm.slice(0, norm.lastIndexOf("/")) : "";
          const parentStem = parent.includes("/") ? parent.slice(parent.lastIndexOf("/") + 1) : parent;
          if (core2.normalizeLocaleTag(stem) === loc || core2.normalizeLocaleTag(parentStem) === loc) return pe.error;
        }
        return "";
      };
      for (const [ns, localeMap] of filesByNs) {
        if (nsFilter && ns !== nsFilter) continue;
        const baseFile = localeMap.get(baseLoc);
        const targetFile = localeMap.get(locale);
        if (!targetFile) {
          const hint = parseErrorHint(locale);
          skippedNs.push({ ns, reason: `\u6CA1\u6709 ${locale} \u7684\u8BED\u8A00\u6587\u4EF6\uFF08\u53EF\u5148\u521B\u5EFA\u7A7A\u5BF9\u8C61\u6587\u4EF6\u518D\u5E94\u7528\uFF09${hint ? `\uFF1B\u89E3\u6790\u5931\u8D25\uFF1A${hint}` : ""}` });
          continue;
        }
        if (!baseFile) {
          skippedNs.push({ ns, reason: `\u57FA\u51C6\u8BED\u8A00 ${baseLoc} \u6587\u4EF6\u7F3A\u5931\u6216\u89E3\u6790\u5931\u8D25\uFF0C\u65E0\u6CD5\u6821\u9A8C` });
          continue;
        }
        const targetFlat = core2.flattenLocale(targetFile.parse.data);
        units.push({ ns, targetFile, baseFlat: core2.flattenLocale(baseFile.parse.data), targetConflicts: targetFlat.conflicts });
      }
      if (!units.length) {
        throw new Error(`\u76EE\u6807\u8BED\u8A00 ${locale} \u6CA1\u6709\u53EF\u5199\u5165\u7684 locale \u6587\u4EF6${skippedNs.length ? `\uFF08${skippedNs.map((s) => `${s.ns}: ${s.reason}`).join("\uFF1B")}\uFF09` : "\uFF08\u5148\u626B\u63CF\u786E\u8BA4\u76EE\u5F55\u4E0E\u5E03\u5C40\uFF09"}`);
      }
      const keyOwner = /* @__PURE__ */ new Map();
      for (const u of units) {
        for (const key of Object.keys(u.baseFlat.map)) {
          const prev = keyOwner.get(key);
          if (!prev) keyOwner.set(key, { ns: u.ns, others: [] });
          else if (prev.ns !== u.ns) prev.others.push(u.ns);
        }
      }
      const byUnit = /* @__PURE__ */ new Map();
      const unknownGlobal = [];
      for (const [rawKey, value] of Object.entries(translations)) {
        const key = String(rawKey).trim();
        if (!key) continue;
        const owner = keyOwner.get(key);
        if (!owner) {
          unknownGlobal.push(key);
          continue;
        }
        if (owner.others.length) throw new Error(`\u952E "${key}" \u5728\u591A\u4E2A ns \u4E2D\u90FD\u5B58\u5728\uFF08${[owner.ns, ...owner.others].join(", ")}\uFF09\uFF0C\u8BF7\u4F20 ns \u53C2\u6570\u6D88\u6B67`);
        if (!byUnit.has(owner.ns)) byUnit.set(owner.ns, {});
        byUnit.get(owner.ns)[key] = value;
      }
      const applied = [];
      const allPlanErrors = [];
      const allWarnings = [];
      const snapshotItems = [];
      for (const u of units) {
        const slice = byUnit.get(u.ns);
        if (!slice || !Object.keys(slice).length) continue;
        const { newDoc, plan } = core2.planApply({
          targetDoc: u.targetFile.parse.data,
          baseFlat: u.baseFlat,
          translations: slice,
          mode,
          targetConflicts: u.targetConflicts,
          allowPlaceholderMismatch: !!p.force
        });
        plan.unknown.forEach((k) => allPlanErrors.push({ key: k, reason: "\u57FA\u51C6\u4E0E\u76EE\u6807\u90FD\u6CA1\u6709\u8FD9\u4E2A\u952E\uFF08\u53EF\u80FD\u662F\u5E7B\u89C9\u952E\uFF09\uFF0C\u5DF2\u62D2\u7EDD" }));
        for (const e of plan.errors) allPlanErrors.push(e);
        for (const w of plan.warnings) allWarnings.push(w);
        if (plan.insert.length || plan.update.length) {
          if (u.targetFile.parse.hasComments && !p.stripComments) {
            allPlanErrors.push({ key: `(${u.ns}) ${u.targetFile.relPath}`, reason: "\u8BE5\u6587\u4EF6\u542B\u6CE8\u91CA\uFF0C\u76F4\u63A5\u5E8F\u5217\u5316\u4F1A\u4E22\u6CE8\u91CA\uFF1B\u786E\u8BA4\u63A5\u53D7\u65F6\u4F20 stripComments:true" });
            continue;
          }
          const afterText = core2.serializeLocale(newDoc, u.targetFile.parse, { yamlDump: yaml2 && yaml2.dump });
          snapshotItems.push({ absPath: u.targetFile.absPath, afterText, ns: u.ns });
          applied.push({ ns: u.ns, file: u.targetFile.relPath, insert: plan.insert.length, update: plan.update.length, noop: plan.noop.length });
        } else {
          applied.push({ ns: u.ns, file: u.targetFile.relPath, insert: 0, update: 0, noop: plan.noop.length });
        }
      }
      if (unknownGlobal.length) {
        allPlanErrors.push({ key: unknownGlobal.slice(0, 10).join(", "), reason: `\u5171 ${unknownGlobal.length} \u4E2A\u952E\u4E0D\u5728\u4EFB\u4F55\u57FA\u51C6\u8BED\u8A00\u6587\u4EF6\u4E2D\uFF08\u53EF\u80FD\u662F\u5E7B\u89C9\u952E\uFF09\uFF0C\u5DF2\u62D2\u7EDD` });
      }
      for (const s of skippedNs) allPlanErrors.push({ key: `(${s.ns})`, reason: `\u8DF3\u8FC7\uFF1A${s.reason}` });
      const blocking = allPlanErrors.filter((e) => !/stripComments|跳过：/.test(e.reason));
      if (blocking.length && !p.force) {
        return { ok: false, errors: allPlanErrors.slice(0, 50), hint: "\u5168\u90E8\u62D2\u7EDD\u672A\u5199\u76D8\u3002\u4FEE\u590D\u8BD1\u6587\u540E\u91CD\u8BD5\uFF1B\u786E\u8BA4\u63A5\u53D7\u65F6\u53EF\u4F20 force:true\uFF08\u4E0D\u63A8\u8350\uFF09\u3002" };
      }
      if (!snapshotItems.length) {
        if (allPlanErrors.length) {
          return { ok: false, errors: allPlanErrors.slice(0, 50), hint: "\u672A\u5199\u76D8\u3002" };
        }
        return { ok: true, noop: true, applied, message: "\u6CA1\u6709\u9700\u8981\u5199\u5165\u7684\u53D8\u66F4\uFF08\u5168\u90E8\u4E3A noop \u6216\u65E0\u7FFB\u8BD1\u5206\u7247\uFF09" };
      }
      const batchId = `${Date.now().toString(36)}-${crypto2.randomBytes(3).toString("hex")}`;
      const snapPayload = snapshotItems.map((item) => ({
        absPath: item.absPath,
        beforeText: fs2.readFileSync(item.absPath, "utf8"),
        afterText: item.afterText
      }));
      engine2.writeSnapshot(appConfigDir, batchId, snapPayload);
      for (const item of snapshotItems) fs2.writeFileSync(item.absPath, item.afterText, "utf8");
      engine2.pruneSnapshots(appConfigDir, 20);
      try {
        if (kv2) {
          const idx = await kv2.kvGet(KEY_UNDO_INDEX2) || [];
          const next = Array.isArray(idx) ? idx : [];
          next.unshift({ batchId, at: (/* @__PURE__ */ new Date()).toISOString(), root: resolvedDir, locale, mode, files: snapshotItems.map((s) => s.absPath) });
          await kv2.kvSet(KEY_UNDO_INDEX2, next.slice(0, 20));
        }
      } catch (e) {
        log2("warn", "undo \u7D22\u5F15\u5199\u5931\u8D25: " + e.message);
      }
      log2("info", `apply ${resolvedDir} ${locale} batch=${batchId} \u6587\u4EF6=${snapshotItems.length} \u63D2\u5165=${applied.reduce((s, a) => s + a.insert, 0)} \u66F4\u65B0=${applied.reduce((s, a) => s + a.update, 0)}`);
      return { ok: true, batchId, applied, warnings: [...scan.warnings || [], ...allWarnings.map((w) => `${w.key}: ${w.reason}`)] };
    }
    module2.exports = { applyTranslations: applyTranslations2, KEY_UNDO_INDEX: KEY_UNDO_INDEX2 };
  }
});

// service/kvclient.js
var require_kvclient = __commonJS({
  "service/kvclient.js"(exports2, module2) {
    "use strict";
    var http2 = require("http");
    var fs2 = require("fs");
    var path2 = require("path");
    var os = require("os");
    var crypto2 = require("crypto");
    var SCAN_PORTS = 25;
    var HEALTH_TIMEOUT_MS = 1200;
    var REQUEST_TIMEOUT_MS = 3e4;
    function md5(s) {
      return crypto2.createHash("md5").update(String(s)).digest("hex");
    }
    function configCandidates(appConfigDir) {
      const cands = [];
      for (const anchor of [
        process.env.APPDATA ? path2.join(process.env.APPDATA, "Polaris", "anchor.json") : "",
        path2.join(os.homedir(), ".config", "Polaris", "anchor.json"),
        path2.join(os.homedir(), ".polaris", "anchor.json")
      ]) {
        try {
          const a = JSON.parse(fs2.readFileSync(anchor, "utf8"));
          if (a && typeof a.dataRoot === "string" && a.dataRoot) {
            cands.push(path2.join(a.dataRoot, "config.json"));
          }
        } catch (_) {
        }
      }
      if (appConfigDir) cands.push(path2.join(appConfigDir, "config.json"));
      if (process.env.APPDATA) cands.push(path2.join(process.env.APPDATA, "Polaris", "config.json"));
      cands.push(path2.join(os.homedir(), ".config", "Polaris", "config.json"));
      cands.push(path2.join(os.homedir(), ".polaris", "config.json"));
      return cands;
    }
    function loadWebConfig(appConfigDir) {
      for (const p of configCandidates(appConfigDir)) {
        try {
          const root = JSON.parse(fs2.readFileSync(p, "utf8"));
          const web = root.web || {};
          if (typeof web.port === "number" && web.port > 0) {
            return { host: web.host || "", port: web.port, token: web.token || "" };
          }
        } catch (_) {
        }
      }
      return null;
    }
    function healthOnce(host, port) {
      return new Promise((resolve) => {
        const req = http2.get(
          { hostname: host, port, path: "/api/health", timeout: HEALTH_TIMEOUT_MS },
          (res) => {
            res.resume();
            resolve(res.statusCode === 200);
          }
        );
        req.on("error", () => resolve(false));
        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });
      });
    }
    async function resolveEndpoint(appConfigDir) {
      const envHost = process.env.POLARIS_HOST || "";
      const envPort = parseInt(process.env.POLARIS_PORT || "", 10);
      if (envHost && Number.isFinite(envPort)) {
        return { host: envHost, port: envPort, token: process.env.POLARIS_TOKEN || "", via: "env" };
      }
      const cfg = loadWebConfig(appConfigDir);
      const cfgHost = cfg && cfg.host || "";
      const host = cfgHost && cfgHost !== "0.0.0.0" ? cfgHost : "127.0.0.1";
      const basePort = cfg ? cfg.port : 3e3;
      const token = cfg ? cfg.token : "";
      for (let i = 0; i < SCAN_PORTS; i++) {
        if (await healthOnce(host, basePort + i)) {
          return { host, port: basePort + i, token, via: "scan" };
        }
      }
      return { host, port: basePort, token, via: "fallback" };
    }
    function createKvClient2(opts) {
      const log2 = opts && opts.log || (() => {
      });
      const appConfigDir = opts && opts.appConfigDir || "";
      let endpointPromise = null;
      let endpoint = null;
      function getEndpoint(force) {
        if (!endpointPromise || force) {
          endpointPromise = resolveEndpoint(appConfigDir).then((ep) => {
            endpoint = ep;
            log2("info", `bridge endpoint: ${ep.host}:${ep.port} (via ${ep.via}${ep.token ? ", authed" : ", noauth"})`);
            return ep;
          });
        }
        return endpointPromise;
      }
      function dispatch(target, payload, { retries = 2, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
        const attempt = (n) => getEndpoint().then((ep) => new Promise((resolve, reject) => {
          const data = JSON.stringify({ req: { target, payload } });
          const headers = {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data)
          };
          if (ep.token) headers.Authorization = `Bearer ${md5(ep.token)}`;
          const req = http2.request(
            {
              hostname: ep.host,
              port: ep.port,
              path: "/api/router-dispatch",
              method: "POST",
              headers,
              timeout: timeoutMs
            },
            (res) => {
              let body = "";
              res.on("data", (c) => {
                body += c;
              });
              res.on("end", () => {
                try {
                  const parsed = JSON.parse(body);
                  resolve(parsed);
                } catch (_) {
                  reject(new Error(`bridge \u8FD4\u56DE\u975E JSON\uFF08HTTP ${res.statusCode}\uFF09`));
                }
              });
            }
          );
          req.on("timeout", () => {
            req.destroy(new Error("bridge timeout"));
          });
          req.on("error", (e) => {
            if (n < retries) {
              log2("warn", `dispatch \u91CD\u8BD5 ${n + 1}/${retries}: ${e.message}`);
              setTimeout(() => attempt(n + 1).then(resolve, reject), 300 * Math.pow(2, n));
            } else reject(e);
          });
          req.write(data);
          req.end();
        }));
        return attempt(0);
      }
      async function dispatchOk(target, payload, opt) {
        const res = await dispatch(target, payload, opt);
        if (!res || res.ok !== true) {
          throw new Error(res && res.error || `${target} dispatch \u5931\u8D25`);
        }
        return res.result;
      }
      async function kvGet(key) {
        const r = await dispatchOk("cap.kv", { action: "get", key });
        return r && r.value !== void 0 ? r.value : null;
      }
      async function kvSet(key, value) {
        await dispatchOk("cap.kv", { action: "set", key, value: value === void 0 ? null : value });
        return true;
      }
      async function kvDel(key) {
        await dispatchOk("cap.kv", { action: "delete", key });
        return true;
      }
      async function kvKeys() {
        const r = await dispatchOk("cap.kv", { action: "list" });
        return r && Array.isArray(r.keys) ? r.keys : [];
      }
      return {
        dispatch,
        dispatchOk,
        kvGet,
        kvSet,
        kvDel,
        kvKeys,
        endpoint: () => endpoint,
        refreshEndpoint: () => getEndpoint(true)
      };
    }
    module2.exports = { createKvClient: createKvClient2, resolveEndpoint, loadWebConfig, md5 };
  }
});

// service/main-src.js
var http = require("http");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var yaml = require_js_yaml();
var core = require_i18n_core();
var engine = require_scan_engine();
var { applyTranslations, KEY_UNDO_INDEX } = require_apply_engine();
var { createKvClient } = require_kvclient();
var VERSION = "0.1.0";
var PREFIX = "i18n.";
var KEY_META = PREFIX + "meta";
var KEY_SETTINGS = PREFIX + "settings";
var PORT = parseInt(process.argv[2] || "", 10) || 0;
var APP_CONFIG_DIR = process.argv[3] || "";
var LOG_FILE = APP_CONFIG_DIR ? path.join(APP_CONFIG_DIR, "i18n-sync.log") : "";
function log(level, msg) {
  if (level === "debug" || !LOG_FILE) return;
  try {
    try {
      const st = fs.statSync(LOG_FILE);
      if (st.size > 512 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + ".old");
    } catch (_) {
    }
    fs.appendFileSync(LOG_FILE, `[i18n-sync:${level}] ${(/* @__PURE__ */ new Date()).toISOString()} ${msg}
`, "utf8");
  } catch (_) {
  }
}
var kv = createKvClient({ appConfigDir: APP_CONFIG_DIR });
var tokenCache = "";
async function ensureToken() {
  if (tokenCache) return tokenCache;
  try {
    const meta = await kv.kvGet(KEY_META);
    if (meta && typeof meta.token === "string" && meta.token) {
      tokenCache = meta.token;
      return tokenCache;
    }
  } catch (_) {
  }
  tokenCache = crypto.randomBytes(16).toString("hex");
  return tokenCache;
}
async function writeMeta() {
  try {
    const prev = await kv.kvGet(KEY_META);
    await kv.kvSet(KEY_META, {
      token: await ensureToken(),
      port: PORT,
      version: VERSION,
      pid: process.pid,
      startedAt: prev && prev.startedAt ? prev.startedAt : (/* @__PURE__ */ new Date()).toISOString(),
      lastTickAt: (/* @__PURE__ */ new Date()).toISOString(),
      appConfigDir: APP_CONFIG_DIR
    });
  } catch (e) {
    log("warn", "meta \u5FC3\u8DF3\u5199\u5931\u8D25\uFF08\u6865\u964D\u7EA7\uFF09: " + e.message);
  }
}
async function loadSettings() {
  try {
    const s = await kv.kvGet(KEY_SETTINGS);
    return s && typeof s === "object" ? s : {};
  } catch (_) {
    return {};
  }
}
function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(obj));
}
function checkAuth(req) {
  if (!tokenCache) return false;
  return String(req.headers["x-i18n-sync-token"] || "") === tokenCache;
}
function readBody(req, maxBytes = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error(`\u8BF7\u6C42\u4F53\u8D85\u9650\uFF08>${maxBytes} \u5B57\u8282\uFF09`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (e) {
        reject(new Error("\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A" + e.message));
      }
    });
    req.on("error", reject);
  });
}
async function doScan(args) {
  const p = String(args.dir || "").trim();
  if (!p) throw new Error("\u7F3A\u5C11 dir\uFF08locale \u6839\u76EE\u5F55\u7EDD\u5BF9\u8DEF\u5F84\uFF09");
  const dir = path.resolve(p);
  if (!fs.existsSync(dir)) throw new Error(`\u76EE\u5F55\u4E0D\u5B58\u5728\uFF1A${dir}`);
  const settings = await loadSettings();
  const baseLocale = args.baseLocale || settings.baseLocale || void 0;
  const t0 = Date.now();
  const scan = engine.scanDir(dir, { baseLocale, yaml });
  log("info", `scan ${dir} \u2192 ${scan.totals.files} \u6587\u4EF6 \u5E03\u5C40=${scan.layout} \u57FA\u51C6=${scan.baseLocale} \u7F3A\u5931=${scan.totals.missing} (${Date.now() - t0}ms)`);
  delete scan.entries;
  return scan;
}
var doApply = (args) => applyTranslations({
  dir: args.dir,
  locale: args.locale,
  translations: args.translations,
  ns: args.ns,
  mode: args.mode,
  stripComments: args.stripComments,
  force: args.force,
  baseLocale: args.baseLocale,
  yaml,
  appConfigDir: APP_CONFIG_DIR,
  kv,
  log
});
var server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/__health") {
    return sendJson(res, 200, { ok: true, version: VERSION });
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-i18n-sync-token"
    });
    return res.end();
  }
  if (!checkAuth(req)) {
    return sendJson(res, 401, { ok: false, error: "\u7F3A\u5C11\u6216\u9519\u8BEF\u7684 token\uFF08\u9762\u677F\u5E94\u4ECE cap.kv i18n.meta \u8BFB\u53D6\uFF09" });
  }
  try {
    if (req.method === "POST" && url.pathname === "/api/scan") {
      const body = await readBody(req);
      return sendJson(res, 200, { ok: true, scan: await doScan(body) });
    }
    if (req.method === "POST" && url.pathname === "/api/apply") {
      const body = await readBody(req);
      const r = await doApply(body);
      return sendJson(res, 200, r);
    }
    if (req.method === "POST" && url.pathname === "/api/undo") {
      const body = await readBody(req);
      if (!body.batchId) return sendJson(res, 400, { ok: false, error: "\u7F3A\u5C11 batchId\uFF08\u4ECE /api/undo-list \u6216\u5E94\u7528\u7ED3\u679C\u53D6\uFF09" });
      const r = engine.restoreSnapshot(APP_CONFIG_DIR, body.batchId);
      log("info", `undo batch=${body.batchId} \u6210\u529F=${r.results.filter((x) => x.ok).length}/${r.results.length}`);
      return sendJson(res, 200, { ok: true, ...r });
    }
    if (req.method === "POST" && url.pathname === "/api/undo-list") {
      const idx = await kv.kvGet(KEY_UNDO_INDEX);
      return sendJson(res, 200, { ok: true, index: Array.isArray(idx) ? idx : [] });
    }
    return sendJson(res, 404, { ok: false, error: `\u672A\u77E5\u8DEF\u7531 ${req.method} ${url.pathname}` });
  } catch (e) {
    log("error", `${req.method} ${url.pathname} \u5931\u8D25: ${e.message}`);
    return sendJson(res, 400, { ok: false, error: e.message });
  }
});
server.listen(PORT, "127.0.0.1", () => {
  log("info", `i18n-sync service listening on 127.0.0.1:${PORT} (v${VERSION})`);
  writeMeta();
  setInterval(writeMeta, 30 * 1e3).unref?.();
});
process.on("uncaughtException", (e) => log("error", "uncaughtException: " + (e && e.stack || e)));
process.on("unhandledRejection", (e) => log("error", "unhandledRejection: " + (e && e.stack || e)));
