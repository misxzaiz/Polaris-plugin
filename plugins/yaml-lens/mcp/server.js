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

// shared/yaml-core.js
var require_yaml_core = __commonJS({
  "shared/yaml-core.js"(exports2, module2) {
    "use strict";
    var MAX_SAFE = 9007199254740991;
    var BOOL11_WARN = /* @__PURE__ */ new Set();
    for (const w of ["yes", "no", "on", "off"]) {
      BOOL11_WARN.add(w);
      BOOL11_WARN.add(w[0].toUpperCase() + w.slice(1));
      BOOL11_WARN.add(w.toUpperCase());
    }
    var BOOL11_SINGLE = /* @__PURE__ */ new Set(["y", "Y", "n", "N"]);
    var SMART_QUOTE_RE = /[\u201C\u201D\u2018\u2019]/;
    var NULL_TOKENS = /* @__PURE__ */ new Set(["~"]);
    function findSmartQuote(s) {
      const m = SMART_QUOTE_RE.exec(s);
      return m ? m.index : -1;
    }
    function sexagesimalToInt(s) {
      const neg = s[0] === "-";
      const body = s.replace(/^[-+]/, "");
      const parts = body.split(":").map((p) => parseInt(p.replace(/_/g, ""), 10));
      let v = 0;
      for (const p of parts) v = v * 60 + p;
      return neg ? -v : v;
    }
    function octalValue(s) {
      const body = s.replace(/^[-+]/, "").replace(/_/g, "");
      if (/[^0-7]/.test(body)) return null;
      const v = parseInt(body, 8);
      return Number.isNaN(v) ? null : v;
    }
    function splitComment(content) {
      let q = null;
      for (let i = 0; i < content.length; i++) {
        const c = content[i];
        if (q) {
          if (q === '"' && c === "\\") {
            i++;
            continue;
          }
          if (q === "'" && c === "'" && content[i + 1] === "'") {
            i++;
            continue;
          }
          if (c === q) q = null;
          continue;
        }
        if (c === '"' || c === "'") {
          q = c;
          continue;
        }
        if (c === "#" && (i === 0 || content[i - 1] === " " || content[i - 1] === "	")) {
          return { code: content.slice(0, i), comment: content.slice(i), openQuote: false };
        }
      }
      return { code: content, comment: "", openQuote: q };
    }
    function unquoteToken(tok) {
      const q = tok[0];
      if (tok.length >= 2 && tok.endsWith(q) && (q === '"' || q === "'")) {
        let inner = tok.slice(1, -1);
        inner = q === '"' ? inner.replace(/\\(["\\])/g, "$1") : inner.replace(/''/g, "'");
        return inner;
      }
      return tok;
    }
    function flowDepth(s) {
      let depth = 0;
      let q = null;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (q) {
          if (q === '"' && c === "\\") {
            i++;
            continue;
          }
          if (c === q) q = null;
          continue;
        }
        if (c === '"' || c === "'") {
          q = c;
          continue;
        }
        if (c === "{" || c === "[") depth++;
        else if (c === "}" || c === "]") depth--;
      }
      return depth;
    }
    function flowMapKeys(s) {
      const keys = [];
      const re = /[{,]\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^:{}\[\],]+?))\s*:/g;
      let m;
      while ((m = re.exec(s)) !== null) keys.push({ name: m[1] !== void 0 ? m[1] : m[2] !== void 0 ? m[2] : m[3].trim(), col: m.index + 1 });
      return keys;
    }
    function jsonSafe(value) {
      if (typeof value === "number") {
        if (value === Infinity) return ".inf";
        if (value === -Infinity) return "-.inf";
        if (Number.isNaN(value)) return ".nan";
        return value;
      }
      if (value instanceof Date) return value.toISOString();
      if (Array.isArray(value)) return value.map(jsonSafe);
      if (value && typeof value === "object") {
        const out = {};
        for (const k of Object.keys(value)) out[k] = jsonSafe(value[k]);
        return out;
      }
      return value;
    }
    function normalizeYamlError(e) {
      const line = e && e.mark && typeof e.mark.line === "number" ? e.mark.line + 1 : null;
      const column = e && e.mark && typeof e.mark.column === "number" ? e.mark.column + 1 : null;
      const reason = e && e.reason || e && e.message && String(e.message).split("\n")[0] || "\u672A\u77E5\u89E3\u6790\u9519\u8BEF";
      let hint = "";
      if (/duplicated mapping key/.test(reason)) {
        hint = "\u91CD\u590D\u952E\uFF1A\u591A\u6570\u89E3\u6790\u5668\uFF08js-yaml / Go yaml.v3 strict\uFF09\u76F4\u63A5\u62D2\u7EDD\uFF0C\u53E6\u4E00\u4E9B\u9759\u9ED8\u8986\u76D6\u2014\u2014\u952E\u8BED\u4E49\u672A\u5B9A\u4E49\uFF0C\u6539\u952E\u540D\u6216\u5220\u6389\u540E\u8005\u3002";
      } else if (/tab characters/.test(reason)) {
        hint = "YAML \u7F29\u8FDB\u53EA\u5141\u8BB8\u7A7A\u683C\uFF1B\u628A\u7F29\u8FDB\u91CC\u7684 Tab \u6362\u6210\u7A7A\u683C\uFF08\u5E38\u89C1\u4E8E\u4ECE\u7EC8\u7AEF/\u7F16\u8F91\u5668\u590D\u5236\u7C98\u8D34\uFF09\u3002";
      } else if (/unidentified alias/.test(reason)) {
        hint = "\u522B\u540D *name \u9700\u8981\u5148\u5728\u540C\u4E00\u6587\u6863\u4E2D\u5B9A\u4E49\u540C\u540D\u951A\u70B9 &name\uFF08\u4E14\u5B9A\u4E49\u5728\u5F15\u7528\u4E4B\u524D\uFF09\u3002";
      } else if (/flow collection/.test(reason)) {
        hint = "flow \u96C6\u5408\uFF08{...} / [...]\uFF09\u6CA1\u6709\u95ED\u5408\uFF0C\u68C0\u67E5\u662F\u5426\u7F3A\u4E86\u6536\u5C3E\u62EC\u53F7\u3002";
      } else if (/could not find expected/.test(reason)) {
        hint = "\u6807\u91CF\u5F62\u6001\u4E0D\u5B8C\u6574\uFF1A\u5E38\u89C1\u4E8E\u7F3A\u7A7A\u683C\uFF08key:value\uFF09\u3001\u5F15\u53F7\u672A\u95ED\u5408\u6216\u7F29\u8FDB\u9519\u4F4D\u3002";
      }
      return { line, column, message: reason, hint };
    }
    function lintYaml(text) {
      const issues = [];
      const seen = /* @__PURE__ */ new Set();
      const push = (rule, severity, line, col, message, hint) => {
        const key = `${rule}|${line}|${col}`;
        if (seen.has(key)) return;
        seen.add(key);
        issues.push({ rule, severity, line, col, message, hint: hint || "" });
      };
      const bom = typeof text === "string" && text.charCodeAt(0) === 65279;
      if (bom) push("bom", "info", 1, 1, "\u6587\u4EF6\u4EE5 BOM \u5F00\u5934", "\u591A\u6570\u5B9E\u73B0\u517C\u5BB9\uFF0C\u4F46\u89C4\u8303\u4E0D\u5EFA\u8BAE\uFF1B\u5EFA\u8BAE\u4FDD\u5B58\u4E3A UTF-8 \u65E0 BOM\u3002");
      const body = bom ? text.slice(1) : String(text == null ? "" : text);
      const lines = body.split(/\r\n|\r|\n/);
      const bytes = typeof TextEncoder !== "undefined" ? new TextEncoder().encode(body).length : body.length;
      const anchors = [];
      const aliases = [];
      let merges = 0;
      let docIdx = 0;
      const anchorNamesByDoc = /* @__PURE__ */ new Map();
      anchorNamesByDoc.set(0, /* @__PURE__ */ new Set());
      let scopes = [];
      let quote = null;
      let block = null;
      let flowCarry = false;
      let firstContentLineOfDoc = 0;
      for (let li = 0; li < lines.length; li++) {
        let applyValue = function(tokenRaw, tokCol, lineNo2, keyCol, standalone) {
          const tok = tokenRaw.trim();
          if (tok === "") return;
          if (tok[0] === "{" && tok.endsWith("}")) {
            const fkeys = flowMapKeys(tok);
            const fseen = /* @__PURE__ */ new Set();
            for (const k of fkeys) {
              if (fseen.has(k.name)) push("dup-key", "error", lineNo2, tokCol + k.col - 1, `flow \u6620\u5C04\u5185\u91CD\u590D\u952E\u300C${k.name}\u300D`, "\u89E3\u6790\u5668\u4F1A\u76F4\u63A5\u629B\u9519\uFF08\u5B9E\u6D4B js-yaml\uFF1Aduplicated mapping key \u5E26\u884C\u5217\uFF09\u3002");
              fseen.add(k.name);
            }
            if (flowDepth(tok) > 0) flowCarry = true;
            return;
          }
          if (tok[0] === '"' || tok[0] === "'") {
            const q = tok[0];
            let i = 1;
            let closed = false;
            while (i < tok.length) {
              const c = tok[i];
              if (q === '"' && c === "\\") {
                i += 2;
                continue;
              }
              if (q === "'" && c === "'" && tok[i + 1] === "'") {
                i += 2;
                continue;
              }
              if (c === q) {
                closed = true;
                break;
              }
              i++;
            }
            if (!closed) {
              quote = q;
              return;
            }
            return;
          }
          if (/^[|>][0-9]*[+-]?$/.test(tok) || /^[|>][+-]?[0-9]*$/.test(tok)) {
            block = { parentIndent: keyCol !== null ? keyCol - 1 : tokCol - 2, contentIndent: null };
            return;
          }
          if (tok[0] === "`" || tok[0] === "@") {
            push("reserved-char", "error", lineNo2, tokCol, `\u300C${tok[0]}\u300D\u662F YAML \u4FDD\u7559\u5B57\u7B26\uFF0C\u4E0D\u80FD\u4F5C\u4E3A\u6807\u91CF\u5F00\u5934`, "\u52A0\u5F15\u53F7\u53EF\u8868\u8FBE\u5B57\u9762\u91CF\uFF08\u5982 '`cmd`'\uFF09\u3002");
            return;
          }
          if (tok[0] === "*") {
            const am = /^[\w.-]+/.exec(tok.slice(1));
            const name = am ? am[0] : tok.slice(1);
            const anchor = anchors.find((a) => a.doc === docIdx && a.name === name && (a.line < lineNo2 || a.line === lineNo2 && a.col < tokCol));
            aliases.push({ name, line: lineNo2, col: tokCol, doc: docIdx, resolved: !!anchor });
            if (!anchor) push("unresolved-alias", "error", lineNo2, tokCol, `\u522B\u540D *${name} \u6CA1\u6709\u524D\u7F6E\u540C\u540D\u951A\u70B9`, "\u89E3\u6790\u5668\u4F1A\u629B\u9519\uFF08\u5B9E\u6D4B js-yaml\uFF1Aunidentified alias \u5E26\u884C\u5217\uFF09\uFF1B\u786E\u8BA4\u951A\u70B9\u540D\u62FC\u5199\u4E0E\u987A\u5E8F\u3002");
            return;
          }
          if (tok[0] === "&") {
            const am = /^[\w.-]+/.exec(tok.slice(1));
            const name = am ? am[0] : tok.slice(1);
            const set = anchorNamesByDoc.get(docIdx);
            if (set.has(name)) push("anchor-dup", "warn", lineNo2, tokCol, `\u951A\u70B9 &${name} \u5728\u540C\u4E00\u6587\u6863\u5185\u91CD\u590D\u5B9A\u4E49`, "\u5F15\u7528\u89E3\u6790\u5230\u6700\u8FD1\u4E00\u4E2A\u5B9A\u4E49\uFF1B\u91CD\u540D\u6613\u8BEF\u8BFB\uFF0C\u5EFA\u8BAE\u6539\u540D\u3002");
            else set.add(name);
            anchors.push({ name, line: lineNo2, col: tokCol, doc: docIdx });
            const remainder = tok.slice(1 + name.length).trim();
            if (remainder !== "") applyValue(remainder, tokCol + 1 + name.length, lineNo2, keyCol, standalone);
            return;
          }
          if (tok[0] === "!") return;
          if (BOOL11_WARN.has(tok)) {
            push("bool-lookalike", "warn", lineNo2, tokCol, `\u300C${tok}\u300D\u5728\u672C\u5DE5\u5177\uFF08YAML 1.2 core\uFF09\u89E3\u6790\u4E3A\u5B57\u7B26\u4E32 "${tok}"\uFF0C\u4F46 PyYAML / Go yaml.v2 / Ansible / kubectl \u7B49 YAML 1.1 \u5B9E\u73B0\u89E3\u6790\u4E3A\u5E03\u5C14 ${tok.toLowerCase() === "no" || tok.toLowerCase() === "off" ? "false" : "true"}`, "\u8FD9\u662F\u300CNorway problem\u300D\uFF1A\u540C\u4E00\u4EFD\u6587\u4EF6\u5728\u4E0D\u540C\u5B9E\u73B0\u91CC\u7C7B\u578B\u76F8\u53CD\u3002\u8981\u56FA\u5B9A\u4E3A\u5B57\u7B26\u4E32\u8BF7\u52A0\u5F15\u53F7\uFF1B\u8981\u56FA\u5B9A\u4E3A\u5E03\u5C14\u8BF7\u5199 true/false\u3002");
            return;
          }
          if (BOOL11_SINGLE.has(tok)) {
            push("bool-single", "info", lineNo2, tokCol, `\u5355\u5B57\u6BCD\u300C${tok}\u300D\u5728 YAML 1.1 \u89C4\u8303\u91CC\u662F\u5E03\u5C14\uFF0C\u4F46 PyYAML 5.1+ \u5DF2\u5F03\u7528\u5355\u5B57\u6BCD\u5F62\u5F0F\uFF08\u6309\u5B57\u7B26\u4E32\uFF09`, "\u591A\u6570\u73B0\u4EE3\u5B9E\u73B0\u6309\u5B57\u7B26\u4E32\u5904\u7406\uFF1B\u8DE8\u5B9E\u73B0\u7A33\u5B9A\u8BF7\u52A0\u5F15\u53F7\u6216\u5199\u5168\u8BCD\u3002");
            return;
          }
          if (/^[-+]?[0-9][0-9_]*(:[0-5]?[0-9])+$/.test(tok)) {
            const v = sexagesimalToInt(tok);
            push("sexagesimal", "warn", lineNo2, tokCol, `\u300C${tok}\u300D\u662F YAML 1.1 \u516D\u5341\u8FDB\u5236\u6570\u5B57\uFF1APyYAML \u7B49\u89E3\u6790\u4E3A\u6574\u6570 ${v}\uFF0C\u672C\u5DE5\u5177\uFF081.2 core\uFF09\u89E3\u6790\u4E3A\u5B57\u7B26\u4E32`, "\u65F6\u95F4/\u6BD4\u5206\u7C7B\u5B57\u7B26\u4E32\u52A1\u5FC5\u52A0\u5F15\u53F7\u2014\u2014\u65E7\u5B9E\u73B0\u91CC 12:34:56 \u4F1A\u9759\u9ED8\u53D8\u6210 45296\u3002");
            return;
          }
          if (/^[-+]?0[0-9_]+$/.test(tok)) {
            const oct = octalValue(tok);
            push("leading-zero", "warn", lineNo2, tokCol, `\u524D\u5BFC\u96F6\u6570\u5B57\u300C${tok}\u300D\uFF1AYAML 1.1\uFF08PyYAML\uFF09\u6309\u516B\u8FDB\u5236\u89E3\u6790\u4E3A ${oct === null ? "\uFF08\u542B 8/9\uFF0C\u516B\u8FDB\u5236\u975E\u6CD5\uFF0C\u90E8\u5206\u5B9E\u73B0\u62A5\u9519\uFF09" : oct}\uFF0C\u672C\u5DE5\u5177\uFF081.2 core\uFF09\u6309\u5341\u8FDB\u5236 ${parseInt(tok.replace(/^[-+]/, "").replace(/_/g, ""), 10)} \u89E3\u6790`, "\u6587\u4EF6\u6743\u9650\uFF080755\uFF09\u3001\u533A\u53F7\u3001\u7F16\u53F7\u7C7B\u503C\u52A1\u5FC5\u52A0\u5F15\u53F7\u3002");
            return;
          }
          if (/^[-+]?[0-9][0-9_]*\.[0-9]*0$/.test(tok)) {
            push("float-form", "warn", lineNo2, tokCol, `\u300C${tok}\u300D\u89E3\u6790\u4E3A\u6570\u503C ${parseFloat(tok.replace(/_/g, ""))}\u2014\u2014\u5C3E\u96F6\u4E22\u5931\uFF081.10 \u2192 1.1\uFF09`, "\u7248\u672C\u53F7\u3001\u91D1\u989D\u3001\u7F16\u53F7\u8BF7\u52A0\u5F15\u53F7\u4FDD\u7559\u4E66\u5199\u5F62\u6001\u3002");
            return;
          }
          if (/^[-+]?[0-9][0-9_]*$/.test(tok)) {
            const digits = tok.replace(/[-+_]/g, "");
            if (digits.length > 15 || Number(tok.replace(/_/g, "")) > MAX_SAFE) {
              push("big-int", "warn", lineNo2, tokCol, `\u6574\u6570\u300C${tok}\u300D\u8D85\u8FC7 JS \u5B89\u5168\u6574\u6570 2^53-1\uFF0Cjs-yaml \u6309\u53CC\u7CBE\u5EA6\u6D6E\u70B9\u89E3\u6790\u5FC5\u7136\u4E22\u7CBE\u5EA6\uFF08\u5B9E\u6D4B 9007199254740993 \u2192 9007199254740992\uFF09`, "\u96EA\u82B1 ID / \u8BA2\u5355\u53F7 / \u7EB3\u79D2\u65F6\u95F4\u6233\u8BF7\u52A0\u5F15\u53F7\u6309\u5B57\u7B26\u4E32\u4F20\u8F93\u3002");
              return;
            }
          }
          if (/^[-+]?[0-9][0-9_]*(\.[0-9_]+)?[eE][-+]?[0-9]+$/.test(tok)) {
            push("sci-note", "info", lineNo2, tokCol, `\u300C${tok}\u300D\u88AB\u89E3\u6790\u4E3A\u6570\u503C ${Number(tok.replace(/_/g, ""))}\uFF08\u79D1\u5B66\u8BA1\u6570\u6CD5\u751F\u6548\uFF09`, "\u8981\u4FDD\u7559\u4E66\u5199\u5F62\u6001\u8BF7\u52A0\u5F15\u53F7\u3002");
            return;
          }
          if (/^[-+]?\.(inf|Inf|INF)$/.test(tok) || /^\.(nan|NaN|NAN)$/.test(tok)) {
            push("special-float", "info", lineNo2, tokCol, `\u300C${tok}\u300D\u89E3\u6790\u4E3A\u975E\u6709\u9650\u6D6E\u70B9\u6570\uFF08${tok.endsWith("nan") || tok.endsWith("NaN") || tok.endsWith("NAN") ? "NaN" : tok[0] === "-" ? "-Infinity" : "Infinity"}\uFF09`, "JSON \u6CA1\u6709\u5BF9\u5E94\u5B57\u9762\u91CF\uFF0C\u5E8F\u5217\u5316\u4F1A\u53D8 null\uFF08\u672C\u5DE5\u5177\u9884\u89C8\u5DF2\u6309\u5B57\u7B26\u4E32\u5448\u73B0\uFF09\u3002");
            return;
          }
          if (/^[-+]?\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:?\d{2})?)?$/.test(tok)) {
            push("timestamp", "info", lineNo2, tokCol, `\u300C${tok}\u300D\u88AB\u8BC6\u522B\u4E3A\u65F6\u95F4\u6233\uFF1Ajs-yaml \u9ED8\u8BA4\u89E3\u6790\u4E3A Date \u5BF9\u8C61\uFF08JSON \u5E8F\u5217\u5316\u6210 ISO \u5B57\u7B26\u4E32\uFF09`, "\u7F16\u53F7/\u7248\u672C\u7C7B\u300C\u957F\u5F97\u50CF\u65E5\u671F\u300D\u7684\u503C\uFF08\u5982 2024-01-02\uFF09\u52A1\u5FC5\u52A0\u5F15\u53F7\uFF0C\u5426\u5219\u7C7B\u578B\u6F02\u79FB\u3002");
            return;
          }
          if (NULL_TOKENS.has(tok)) {
            push("null-tilde", "info", lineNo2, tokCol, "\u300C~\u300D\u89E3\u6790\u4E3A null", "\u8981\u5B57\u9762\u6CE2\u6D6A\u7EBF\u6216\u7A7A\u4E32\u8BF7\u52A0\u5F15\u53F7\u3002");
            return;
          }
          if (standalone && /^[A-Za-z0-9_.\-/]{1,64}:(?![/\s])\S+$/.test(tok)) {
            push("colon-nospace", "info", lineNo2, tokCol, `\u300C${tok}\u300D\u662F\u5355\u4E2A\u5B57\u7B26\u4E32\u6807\u91CF\uFF0C\u4E0D\u662F\u952E\u503C\u5BF9`, "\u82E5\u60F3\u8868\u8FBE\u6620\u5C04\u5FC5\u987B\u5199\u6210\u300Ckey: value\u300D\uFF08\u5192\u53F7\u540E\u6709\u7A7A\u683C\uFF09\uFF1B\u82E5\u672C\u610F\u5C31\u662F host:port \u5F62\u6001\u5B57\u7B26\u4E32\uFF0C\u5F53\u524D\u89E3\u6790\u5408\u6CD5\u3002");
          }
        };
        const lineNo = li + 1;
        const raw = lines[li];
        if (block) {
          if (/^\s*$/.test(raw)) continue;
          const ind = (/(^[ \t]*)/.exec(raw) || ["", ""])[1].length;
          if (block.contentIndent === null) {
            if (ind > block.parentIndent) {
              block.contentIndent = ind;
              continue;
            }
            block = null;
          } else if (ind >= block.contentIndent) {
            continue;
          } else {
            block = null;
          }
        }
        if (quote) {
          let i = 0;
          let closed = -1;
          while (i < raw.length) {
            const c = raw[i];
            if (quote === '"' && c === "\\") {
              i += 2;
              continue;
            }
            if (quote === "'" && c === "'" && raw[i + 1] === "'") {
              i += 2;
              continue;
            }
            if (c === quote) {
              closed = i;
              break;
            }
            i++;
          }
          if (closed === -1) continue;
          quote = null;
          const restLine = raw.slice(closed + 1);
          const sq = findSmartQuote(restLine);
          if (sq !== -1) push("smart-quote", "error", lineNo, closed + 2 + sq, "\u667A\u80FD\u5F15\u53F7\uFF08\u201C\u201D\u2018\u2019\uFF09\u4E0D\u662F YAML \u5F15\u53F7", "\u5B83\u4EEC\u4F1A\u6210\u4E3A\u5B57\u7B26\u4E32\u6570\u636E\u7684\u4E00\u90E8\u5206\uFF1B\u672C\u610F\u662F\u52A0\u5F15\u53F7\u8BF7\u7528 ASCII \u534A\u89D2\u5F15\u53F7\u3002");
          continue;
        }
        if (flowCarry) {
          const { code: code2 } = splitComment(raw);
          const sq = findSmartQuote(code2);
          if (sq !== -1) push("smart-quote", "error", lineNo, sq + 1, "\u667A\u80FD\u5F15\u53F7\uFF08\u201C\u201D\u2018\u2019\uFF09\u4E0D\u662F YAML \u5F15\u53F7", "\u5B83\u4EEC\u4F1A\u6210\u4E3A\u5B57\u7B26\u4E32\u6570\u636E\u7684\u4E00\u90E8\u5206\uFF1B\u672C\u610F\u662F\u52A0\u5F15\u53F7\u8BF7\u7528 ASCII \u534A\u89D2\u5F15\u53F7\u3002");
          if (flowDepth(code2) <= 0) flowCarry = false;
          continue;
        }
        const ws = (/(^[ \t]*)/.exec(raw) || ["", ""])[1];
        const tabIdx = ws.indexOf("	");
        const trimmedFull = raw.trim();
        if (trimmedFull !== "" && tabIdx !== -1) {
          push("tab-indent", "error", lineNo, tabIdx + 1, "\u7F29\u8FDB\u5305\u542B\u5236\u8868\u7B26 Tab", "YAML \u7981\u6B62 Tab \u7F29\u8FDB\uFF08\u53EA\u5141\u8BB8\u7A7A\u683C\uFF09\uFF1B\u7F16\u8F91\u5668\u300CTab \u8F6C\u7A7A\u683C\u300D\u6216\u66FF\u6362\u7C98\u8D34\u6B8B\u7559\u3002");
        }
        if (trimmedFull === "" || trimmedFull.startsWith("#")) {
          if (trimmedFull !== "") firstContentLineOfDoc = firstContentLineOfDoc;
          continue;
        }
        const contentStart = raw.length - raw.replace(/^\s+/, "").length;
        const content = trimmedFull;
        if (content === "---" || content.startsWith("--- ")) {
          docIdx++;
          anchorNamesByDoc.set(docIdx, /* @__PURE__ */ new Set());
          scopes = [];
          firstContentLineOfDoc = 0;
          continue;
        }
        if (content === "...") continue;
        const { code, comment } = splitComment(content);
        if (code.trim() === "") {
          continue;
        }
        if (firstContentLineOfDoc === 0) firstContentLineOfDoc = lineNo;
        const sqIdx = findSmartQuote(code);
        if (sqIdx !== -1) {
          push("smart-quote", "error", lineNo, contentStart + sqIdx + 1, "\u667A\u80FD\u5F15\u53F7\uFF08\u201C\u201D\u2018\u2019\uFF09\u4E0D\u662F YAML \u5F15\u53F7", '\u5B83\u4EEC\u4F1A\u6210\u4E3A\u5B57\u7B26\u4E32\u6570\u636E\u7684\u4E00\u90E8\u5206\uFF08\u5B9E\u6D4B js-yaml\uFF1Aa: \u201Cx\u201D \u2192 "\u201Cx\u201D"\uFF09\uFF1B\u672C\u610F\u662F\u52A0\u5F15\u53F7\u8BF7\u7528 ASCII \u534A\u89D2\u5F15\u53F7\u3002');
        }
        if (code[0] === "%") {
          if (!/^%(YAML|TAG)\b/.test(code) || firstContentLineOfDoc !== lineNo) {
            push("percent-middoc", "error", lineNo, contentStart + 1, "\u300C%\u300D\u5F00\u5934\u7684\u5185\u5BB9\u53EA\u5728\u6587\u6863\u9996\u884C\u4F5C\u4E3A\u6307\u4EE4\uFF08%YAML/%TAG\uFF09\u5408\u6CD5", "\u666E\u901A\u6570\u636E\u4EE5 % \u5F00\u5934\u5FC5\u987B\u52A0\u5F15\u53F7\u3002");
          }
          continue;
        }
        let rest = code;
        let colBase = contentStart;
        let dashCount = 0;
        for (; ; ) {
          const m = /^(-\s+|-\s*$)/.exec(rest);
          if (!m) break;
          if (m[0] === "-" && rest.trim() === "-") {
            rest = "";
            break;
          }
          colBase += m[0].length;
          rest = rest.slice(m[0].length);
          dashCount++;
          if (m[0].trimEnd() === "-" && rest.trim() === "") {
            rest = "";
            break;
          }
        }
        if (rest.trim() === "") continue;
        const keyRe = /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^:\s#"'][^:#]*?)\s*:(?:\s+|$)/;
        const km = keyRe.exec(rest);
        if (km) {
          const keyTok = km[1];
          const keyQuoted = keyTok[0] === '"' || keyTok[0] === "'";
          const keyName = keyQuoted ? unquoteToken(keyTok) : keyTok.trim();
          const keyCol = colBase + 1;
          const valuePart = rest.slice(km[0].length).replace(/^[ \t]+/, "");
          const valueCol = colBase + km[0].length + (rest.slice(km[0].length).length - rest.slice(km[0].length).replace(/^[ \t]+/, "").length) + 1;
          const popGE = dashCount > 0 ? keyCol : keyCol + 1;
          while (scopes.length && scopes[scopes.length - 1].indent >= popGE) scopes.pop();
          let top = scopes[scopes.length - 1];
          if (!top || top.indent !== keyCol) {
            top = { indent: keyCol, keys: /* @__PURE__ */ new Set() };
            scopes.push(top);
          }
          if (!keyQuoted && top.keys.has(keyName)) {
            push("dup-key", "error", lineNo, keyCol, `\u91CD\u590D\u952E\u300C${keyName}\u300D\uFF08\u540C\u5C42\u5DF2\u51FA\u73B0\u8FC7\uFF09`, "\u591A\u6570\u89E3\u6790\u5668\u62D2\u7EDD\u6216\u9759\u9ED8\u8986\u76D6\uFF0C\u952E\u8BED\u4E49\u672A\u5B9A\u4E49\uFF1B\u6539\u952E\u540D\u6216\u5220\u6389\u540E\u8005\u3002");
          }
          top.keys.add(keyName);
          if (keyName === "<<") {
            merges++;
            push("merge-key", "info", lineNo, keyCol, "\u5408\u5E76\u952E\u300C<<\u300D\uFF1A\u628A\u951A\u70B9\u6620\u5C04\u7684\u952E\u5E76\u5165\u5F53\u524D\u6620\u5C04\uFF08\u672C\u6620\u5C04\u540C\u540D\u952E\u4F18\u5148\uFF09", "\u7B49\u4EF7\u5C55\u5F00\u7531\u89E3\u6790\u5668\u5B8C\u6210\uFF1B\u6539\u7528\u663E\u5F0F\u952E\u53EF\u8BFB\u6027\u66F4\u597D\u3002js-yaml DEFAULT_SCHEMA \u652F\u6301\u8BE5\u8BED\u4E49\uFF08\u5B9E\u6D4B\uFF09\u3002");
          }
          if (valuePart === "") {
            push("empty-value", "info", lineNo, keyCol, `\u952E\u300C${keyName}\u300D\u7684\u503C\u4E3A\u7A7A \u2192 \u89E3\u6790\u4E3A null`, comment ? "\u5192\u53F7\u540E\u76F4\u63A5\u8DDF\u6CE8\u91CA\u4E5F\u662F null\uFF1B\u8981\u7A7A\u5B57\u7B26\u4E32\u8BF7\u5199 key: ''\u3002" : `\u8981\u7A7A\u5B57\u7B26\u4E32\u8BF7\u5199 key: ''\uFF1Bnull \u4E0E\u7A7A\u4E32\u5728\u4E0B\u6E38\u5224\u65AD\uFF08if key: / != ""\uFF09\u91CC\u884C\u4E3A\u4E0D\u540C\u3002`);
          } else {
            if (comment) {
              const vTrim = valuePart.trim();
              if (vTrim[0] !== '"' && vTrim[0] !== "'") {
                const hashOffset = content.length - comment.length;
                push("comment-swallow", "info", lineNo, contentStart + hashOffset + 1, `\u300C#\u300D\u4ECE\u8FD9\u91CC\u5F00\u59CB\u662F\u6CE8\u91CA\uFF1A\u6CE8\u91CA\u5185\u5BB9\u4E0D\u4F1A\u8FDB\u5165\u6570\u636E\uFF08\u503C = ${vTrim}\uFF09`, '\u8981\u4FDD\u7559\u503C\u4E2D\u7684 #\uFF0C\u8BF7\u7ED9\u503C\u52A0\u5F15\u53F7\uFF08\u5B9E\u6D4B a: "x # y" \u2192 "x # y"\uFF09\u3002');
              }
            }
            applyValue(valuePart, valueCol, lineNo, keyCol, false);
          }
          continue;
        }
        const token = rest.trim();
        const tokenCol = colBase + (rest.length - rest.replace(/^\s+/, "").length) + 1;
        if (token[0] === "{" || token[0] === "[") {
          const singleLine = token[0] === "{" && token.endsWith("}");
          if (singleLine) {
            const fkeys = flowMapKeys(token);
            const fseen = /* @__PURE__ */ new Map();
            for (const k of fkeys) {
              if (fseen.has(k.name)) push("dup-key", "error", lineNo, tokenCol + k.col - 1, `flow \u6620\u5C04\u5185\u91CD\u590D\u952E\u300C${k.name}\u300D`, "\u89E3\u6790\u5668\u4F1A\u76F4\u63A5\u629B\u9519\uFF08\u5B9E\u6D4B js-yaml\uFF1Aduplicated mapping key \u5E26\u884C\u5217\uFF09\u3002");
              fseen.set(k.name, true);
            }
          }
          if (flowDepth(token) > 0) flowCarry = true;
          continue;
        }
        applyValue(token, tokenCol, lineNo, null, true);
      }
      for (const a of aliases) {
        const ok = anchors.some((x) => x.doc === a.doc && x.name === a.name && (x.line < a.line || x.line === a.line && x.col < a.col));
        a.resolved = ok;
      }
      issues.sort((x, y) => x.line - y.line || x.col - y.col);
      return {
        issues,
        anchors,
        aliases,
        merges,
        docs: docIdx + 1,
        stats: { lines: lines.length, bytes }
      };
    }
    module2.exports = { lintYaml, jsonSafe, normalizeYamlError, sexagesimalToInt, octalValue };
  }
});

// mcp/server-src.js
var yaml = require_js_yaml();
var core = require_yaml_core();
var SERVER_INFO = { name: "yaml-lens", version: "0.1.0" };
var PREVIEW_LIMIT = 6e3;
var TOOLS = [
  {
    name: "yaml_lens_parse",
    description: "\u89E3\u6790 YAML \u6587\u672C\uFF08\u652F\u6301\u591A\u6587\u6863 ---\uFF09\uFF1A\u8FD4\u56DE\u6BCF\u4E2A\u6587\u6863\u7684 JSON \u9884\u89C8\u3001\u951A\u70B9/\u522B\u540D\u6E05\u5355\u3001\u6587\u6863\u7EDF\u8BA1\u3002\u89E3\u6790\u5931\u8D25\u65F6\u7ED9\u51FA 1 \u57FA\u884C\u5217\u5B9A\u4F4D\u3001\u539F\u56E0\u4E0E\u4FEE\u590D\u63D0\u793A\uFF08\u91CD\u590D\u952E/Tab \u7F29\u8FDB/\u672A\u95ED\u5408 flow/\u672A\u5B9A\u4E49\u522B\u540D\u7B49\uFF09\u3002\u57FA\u4E8E js-yaml 4.1.0\uFF08YAML 1.2 core \u8BED\u4E49\uFF09\u3002",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "YAML \u6587\u672C\uFF08\u53EF\u542B\u591A\u6587\u6863 ---\uFF09" }
      },
      required: ["text"]
    }
  },
  {
    name: "yaml_lens_lint",
    description: "YAML \u5751\u68C0\u6D4B\uFF08\u9759\u6001\u626B\u63CF\uFF0C\u4E0D\u4F9D\u8D56\u89E3\u6790\u6210\u529F\uFF09\uFF1ANorway problem\uFF08unquoted no/on/off \u5728 YAML 1.1 \u5B9E\u73B0\u5982 PyYAML/Go-yaml/kubectl \u4E2D\u662F\u5E03\u5C14\uFF09\u3001\u524D\u5BFC\u96F6\u516B\u8FDB\u5236\u3001\u516D\u5341\u8FDB\u5236 12:34:56\u3001\u7248\u672C\u53F7\u5C3E\u96F6\u4E22\u5931 1.10\u21921.1\u3001\u5927\u6574\u6570\u7CBE\u5EA6\u4E22\u5931\uFF08\u8D85 2^53\uFF09\u3001\u91CD\u590D\u952E\u3001Tab \u7F29\u8FDB\u3001\u667A\u80FD\u5F15\u53F7\u3001\u65F6\u95F4\u6233\u6F02\u79FB\uFF082024-01-02 \u2192 Date\uFF09\u3001\u6CE8\u91CA\u541E\u503C\u3001\u952E\u540E\u7F3A\u7A7A\u683C\u3001\u7A7A\u503C null\u3001\u951A\u70B9\u91CD\u590D/\u522B\u540D\u672A\u5B9A\u4E49\u3002\u6BCF\u6761\u7ED9\u4E25\u91CD\u5EA6/\u884C\u5217/\u8BF4\u660E/\u4FEE\u590D\u5EFA\u8BAE\u3002",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "YAML \u6587\u672C" }
      },
      required: ["text"]
    }
  },
  {
    name: "yaml_lens_to_json",
    description: "YAML \u2192 JSON \u8F6C\u6362\uFF08js-yaml 4.1.0\uFF09\u3002\u5355\u6587\u6863\u8F93\u51FA JSON \u5BF9\u8C61\uFF0C\u591A\u6587\u6863\u8F93\u51FA JSON \u6570\u7EC4\uFF08\u6BCF\u4E2A\u5143\u7D20\u4E00\u4E2A\u6587\u6863\uFF09\u3002\u89E3\u6790\u5931\u8D25\u5982\u5B9E\u62A5\u9519\u5E26\u884C\u5217\uFF0C\u4E0D\u8F93\u51FA\u534A\u6210\u54C1\u3002.inf/.nan/Date \u5DF2\u5B57\u7B26\u4E32\u5316\uFF0C\u4E0D\u4F1A\u9759\u9ED8\u53D8 null\u3002",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "YAML \u6587\u672C" },
        indent: { type: "number", description: "JSON \u7F29\u8FDB\u7A7A\u683C\u6570\uFF0C\u9ED8\u8BA4 2" }
      },
      required: ["text"]
    }
  },
  {
    name: "yaml_lens_to_yaml",
    description: "JSON \u2192 YAML \u8F6C\u6362\uFF08js-yaml dump\uFF1A\u9ED8\u8BA4\u4E0D\u6298\u884C lineWidth=-1\u3001noRefs \u5C55\u5F00\u5171\u4EAB\u5F15\u7528\u3001\u53EF\u6392\u5E8F\u952E\uFF09\u3002\u8F93\u5165\u5FC5\u987B\u662F\u5408\u6CD5 JSON\uFF0C\u5426\u5219\u5982\u5B9E\u62A5\u9519\u3002",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "JSON \u6587\u672C" },
        indent: { type: "number", description: "YAML \u7F29\u8FDB\u7A7A\u683C\u6570\uFF0C\u9ED8\u8BA4 2" },
        sortKeys: { type: "boolean", description: "\u662F\u5426\u6309\u952E\u540D\u6392\u5E8F\uFF0C\u9ED8\u8BA4 false" }
      },
      required: ["text"]
    }
  }
];
function parseAll(text) {
  if (String(text).trim() === "") return { ok: true, docs: [], empty: true };
  try {
    const docs = yaml.loadAll(text);
    return { ok: true, docs: docs.map((d) => core.jsonSafe(d)) };
  } catch (e) {
    return { ok: false, error: core.normalizeYamlError(e) };
  }
}
function fenceJson(value, limit) {
  let s;
  try {
    s = JSON.stringify(value, null, 2) ?? String(value);
  } catch (_) {
    s = String(value);
  }
  if (limit && s.length > limit) s = s.slice(0, limit) + `
\u2026\uFF08\u5DF2\u622A\u65AD\uFF0C\u539F\u6587 ${s.length} \u5B57\u7B26\uFF09`;
  return "```json\n" + s + "\n```";
}
function anchorLines(scan) {
  const parts = [];
  if (scan.anchors.length) parts.push("\u951A\u70B9\uFF1A" + scan.anchors.map((a) => `&${a.name}(${a.line}:${a.col})`).join(" "));
  if (scan.aliases.length) parts.push("\u522B\u540D\uFF1A" + scan.aliases.map((a) => `*${a.name}(${a.line}:${a.col}${a.resolved ? "\uFF0C\u5DF2\u89E3\u6790" : "\uFF0C\u672A\u5B9A\u4E49!"})`).join(" "));
  if (scan.merges > 0) parts.push(`\u5408\u5E76\u952E << \xD7${scan.merges}`);
  return parts;
}
var SEV_ORDER = { error: 0, warn: 1, info: 2 };
var SEV_LABEL = { error: "\u274C\u9519\u8BEF", warn: "\u26A0\uFE0F\u8B66\u544A", info: "\u2139\uFE0F\u63D0\u793A" };
function toolParse(args) {
  const text = typeof args.text === "string" ? args.text : "";
  const r = parseAll(text);
  if (!r.ok) {
    const e = r.error;
    return { isError: true, text: `\u89E3\u6790\u5931\u8D25\uFF1A${e.message}${e.line ? `\uFF08\u7B2C ${e.line} \u884C\u7B2C ${e.column} \u5217\uFF09` : ""}${e.hint ? `

${e.hint}` : ""}` };
  }
  const scan = core.lintYaml(text);
  const out = [];
  out.push(r.empty ? "\u7A7A\u6587\u672C\uFF1A\u65E0\u6587\u6863\u3002" : `\u89E3\u6790\u6210\u529F\uFF1A${r.docs.length} \u4E2A\u6587\u6863\uFF08${scan.stats.lines} \u884C / ${scan.stats.bytes} \u5B57\u8282\uFF09`);
  if (r.docs.length === 0) return { isError: false, text: out.join("\n") };
  const inv = anchorLines(scan);
  if (inv.length) out.push("", inv.join(" \uFF5C "));
  r.docs.forEach((d, i) => {
    out.push("", `## \u6587\u6863 ${i + 1}${r.docs.length === 1 ? "" : `\uFF08\u5171 ${r.docs.length} \u4E2A\uFF09`}`, "", fenceJson(d, PREVIEW_LIMIT));
  });
  return { isError: false, text: out.join("\n") };
}
function toolLint(args) {
  const text = typeof args.text === "string" ? args.text : "";
  const scan = core.lintYaml(text);
  const counts = { error: 0, warn: 0, info: 0 };
  for (const i of scan.issues) counts[i.severity]++;
  const out = [];
  out.push(`\u9759\u6001\u626B\u63CF\u5B8C\u6210\uFF1A${scan.stats.lines} \u884C\uFF0C\u6587\u6863 ${scan.docs} \u4E2A \u2014\u2014 \u274C\u9519\u8BEF ${counts.error} / \u26A0\uFE0F\u8B66\u544A ${counts.warn} / \u2139\uFE0F\u63D0\u793A ${counts.info}`);
  const pr = parseAll(text);
  if (!pr.ok) {
    const e = pr.error;
    out.push(`\u89E3\u6790\u72B6\u6001\uFF1A**\u5931\u8D25** \u2014\u2014 ${e.message}${e.line ? `\uFF08\u7B2C ${e.line} \u884C\u7B2C ${e.column} \u5217\uFF09` : ""}`);
    if (e.hint) out.push(`> ${e.hint}`);
  } else if (pr.empty) {
    out.push("\u89E3\u6790\u72B6\u6001\uFF1A\u7A7A\u6587\u672C\u3002");
  } else {
    out.push("\u89E3\u6790\u72B6\u6001\uFF1A\u6210\u529F\uFF08js-yaml 4.1.0\uFF0CYAML 1.2 core \u8BED\u4E49\uFF09\u3002");
  }
  if (scan.issues.length === 0) {
    out.push("", "\u672A\u53D1\u73B0\u5DF2\u77E5\u5751\u6A21\u5F0F\u3002\u6CE8\u610F\uFF1A\u672C\u5DE5\u5177\u8986\u76D6\u8DE8\u5B9E\u73B0\u8BED\u4E49\u6F02\u79FB\u4E0E\u5E38\u89C1\u4E66\u5199\u9677\u9631\uFF0C\u4E0D\u7B49\u4E8E\u300C\u8BED\u4E49\u6B63\u786E\u300D\u3002");
    return { isError: false, text: out.join("\n") };
  }
  out.push("", "| \u4E25\u91CD\u5EA6 | \u4F4D\u7F6E | \u89C4\u5219 | \u8BF4\u660E |", "|---|---|---|---|");
  const sorted = [...scan.issues].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.line - b.line || a.col - b.col);
  for (const i of sorted) {
    const msg = i.hint ? `${i.message}\uFF08${i.hint}\uFF09` : i.message;
    out.push(`| ${SEV_LABEL[i.severity]} | ${i.line}:${i.col} | \`${i.rule}\` | ${msg.replace(/\|/g, "\\|")} |`);
  }
  return { isError: false, text: out.join("\n") };
}
function toolToJson(args) {
  const text = typeof args.text === "string" ? args.text : "";
  let indent = 2;
  if (args.indent !== void 0) {
    indent = Number(args.indent);
    if (!Number.isInteger(indent) || indent < 0 || indent > 10) return { isError: true, text: "indent \u5FC5\u987B\u662F 0-10 \u7684\u6574\u6570\u3002" };
  }
  const r = parseAll(text);
  if (!r.ok) {
    const e = r.error;
    return { isError: true, text: `\u89E3\u6790\u5931\u8D25\uFF1A${e.message}${e.line ? `\uFF08\u7B2C ${e.line} \u884C\u7B2C ${e.column} \u5217\uFF09` : ""}${e.hint ? `

${e.hint}` : ""}` };
  }
  if (r.empty) return { isError: true, text: "\u7A7A\u6587\u672C\u6CA1\u6709\u53EF\u8F6C\u6362\u7684\u6587\u6863\u3002" };
  const value = r.docs.length === 1 ? r.docs[0] : r.docs;
  const note = r.docs.length === 1 ? "" : `
# \u6CE8\uFF1A${r.docs.length} \u4E2A\u6587\u6863\u5DF2\u8F93\u51FA\u4E3A JSON \u6570\u7EC4\uFF08\u6309\u6587\u6863\u987A\u5E8F\uFF09`;
  return { isError: false, text: JSON.stringify(value, null, indent) + note };
}
function toolToYaml(args) {
  const text = typeof args.text === "string" ? args.text : "";
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { isError: true, text: `\u8F93\u5165\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${e.message}` };
  }
  const opts = {
    indent: 2,
    sortKeys: false,
    lineWidth: -1,
    // 实测 js-yaml 4.1.0：-1 = 不折行（默认 80 会把长行折断）
    noRefs: true
    // 展开共享引用，避免产出 &anchor/*ref 惊喜
  };
  if (args.indent !== void 0) {
    const n = Number(args.indent);
    if (!Number.isInteger(n) || n < 1 || n > 10) return { isError: true, text: "indent \u5FC5\u987B\u662F 1-10 \u7684\u6574\u6570\u3002" };
    opts.indent = n;
  }
  if (args.sortKeys !== void 0) opts.sortKeys = !!args.sortKeys;
  let out;
  try {
    out = yaml.dump(value, opts);
  } catch (e) {
    return { isError: true, text: `YAML \u5E8F\u5217\u5316\u5931\u8D25\uFF1A${e.message}` };
  }
  return { isError: false, text: out };
}
var HANDLERS = {
  yaml_lens_parse: toolParse,
  yaml_lens_lint: toolLint,
  yaml_lens_to_json: toolToJson,
  yaml_lens_to_yaml: toolToYaml
};
function write(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
var buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => {
  buf += c;
  for (; ; ) {
    const i = buf.indexOf("\n");
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) handleLine(line);
  }
});
process.stdin.on("end", () => process.exit(0));
function handleLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (_) {
    write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  const { id, method, params } = msg;
  if (method === "initialize") {
    write({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: SERVER_INFO } });
    return;
  }
  if (method === "notifications/initialized" || (method || "").startsWith("notifications/")) return;
  if (method === "tools/list") {
    write({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    return;
  }
  if (method === "tools/call") {
    const name = params && params.name;
    const handler = HANDLERS[name];
    if (!handler) {
      write({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: `\u672A\u77E5\u5DE5\u5177\uFF1A${name}\u3002\u53EF\u7528\uFF1A${TOOLS.map((t) => t.name).join(", ")}` }] } });
      return;
    }
    try {
      const r = handler(params && params.arguments || {});
      write({ jsonrpc: "2.0", id, result: { isError: !!r.isError, content: [{ type: "text", text: r.text }] } });
    } catch (e) {
      process.stderr.write(`[yaml-lens] tool ${name} \u5F02\u5E38: ${e && e.stack ? e.stack : e}
`);
      write({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: `\u5DE5\u5177\u5185\u90E8\u9519\u8BEF\uFF1A${e && e.message ? e.message : String(e)}` }] } });
    }
    return;
  }
  if (method === "ping") {
    write({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  write({ jsonrpc: "2.0", id: id === void 0 ? null : id, error: { code: -32601, message: `Method not found: ${method}` } });
}
process.stderr.write(`[yaml-lens] MCP server ${SERVER_INFO.version} ready (stdio)
`);
