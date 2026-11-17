var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
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

// node_modules/react-is/cjs/react-is.development.js
var require_react_is_development = __commonJS({
  "node_modules/react-is/cjs/react-is.development.js"(exports) {
    "use strict";
    if (true) {
      (function() {
        "use strict";
        var hasSymbol = typeof Symbol === "function" && Symbol.for;
        var REACT_ELEMENT_TYPE = hasSymbol ? Symbol.for("react.element") : 60103;
        var REACT_PORTAL_TYPE = hasSymbol ? Symbol.for("react.portal") : 60106;
        var REACT_FRAGMENT_TYPE = hasSymbol ? Symbol.for("react.fragment") : 60107;
        var REACT_STRICT_MODE_TYPE = hasSymbol ? Symbol.for("react.strict_mode") : 60108;
        var REACT_PROFILER_TYPE = hasSymbol ? Symbol.for("react.profiler") : 60114;
        var REACT_PROVIDER_TYPE = hasSymbol ? Symbol.for("react.provider") : 60109;
        var REACT_CONTEXT_TYPE = hasSymbol ? Symbol.for("react.context") : 60110;
        var REACT_ASYNC_MODE_TYPE = hasSymbol ? Symbol.for("react.async_mode") : 60111;
        var REACT_CONCURRENT_MODE_TYPE = hasSymbol ? Symbol.for("react.concurrent_mode") : 60111;
        var REACT_FORWARD_REF_TYPE = hasSymbol ? Symbol.for("react.forward_ref") : 60112;
        var REACT_SUSPENSE_TYPE = hasSymbol ? Symbol.for("react.suspense") : 60113;
        var REACT_SUSPENSE_LIST_TYPE = hasSymbol ? Symbol.for("react.suspense_list") : 60120;
        var REACT_MEMO_TYPE = hasSymbol ? Symbol.for("react.memo") : 60115;
        var REACT_LAZY_TYPE = hasSymbol ? Symbol.for("react.lazy") : 60116;
        var REACT_BLOCK_TYPE = hasSymbol ? Symbol.for("react.block") : 60121;
        var REACT_FUNDAMENTAL_TYPE = hasSymbol ? Symbol.for("react.fundamental") : 60117;
        var REACT_RESPONDER_TYPE = hasSymbol ? Symbol.for("react.responder") : 60118;
        var REACT_SCOPE_TYPE = hasSymbol ? Symbol.for("react.scope") : 60119;
        function isValidElementType(type) {
          return typeof type === "string" || typeof type === "function" || // Note: its typeof might be other than 'symbol' or 'number' if it's a polyfill.
          type === REACT_FRAGMENT_TYPE || type === REACT_CONCURRENT_MODE_TYPE || type === REACT_PROFILER_TYPE || type === REACT_STRICT_MODE_TYPE || type === REACT_SUSPENSE_TYPE || type === REACT_SUSPENSE_LIST_TYPE || typeof type === "object" && type !== null && (type.$$typeof === REACT_LAZY_TYPE || type.$$typeof === REACT_MEMO_TYPE || type.$$typeof === REACT_PROVIDER_TYPE || type.$$typeof === REACT_CONTEXT_TYPE || type.$$typeof === REACT_FORWARD_REF_TYPE || type.$$typeof === REACT_FUNDAMENTAL_TYPE || type.$$typeof === REACT_RESPONDER_TYPE || type.$$typeof === REACT_SCOPE_TYPE || type.$$typeof === REACT_BLOCK_TYPE);
        }
        function typeOf(object) {
          if (typeof object === "object" && object !== null) {
            var $$typeof = object.$$typeof;
            switch ($$typeof) {
              case REACT_ELEMENT_TYPE:
                var type = object.type;
                switch (type) {
                  case REACT_ASYNC_MODE_TYPE:
                  case REACT_CONCURRENT_MODE_TYPE:
                  case REACT_FRAGMENT_TYPE:
                  case REACT_PROFILER_TYPE:
                  case REACT_STRICT_MODE_TYPE:
                  case REACT_SUSPENSE_TYPE:
                    return type;
                  default:
                    var $$typeofType = type && type.$$typeof;
                    switch ($$typeofType) {
                      case REACT_CONTEXT_TYPE:
                      case REACT_FORWARD_REF_TYPE:
                      case REACT_LAZY_TYPE:
                      case REACT_MEMO_TYPE:
                      case REACT_PROVIDER_TYPE:
                        return $$typeofType;
                      default:
                        return $$typeof;
                    }
                }
              case REACT_PORTAL_TYPE:
                return $$typeof;
            }
          }
          return void 0;
        }
        var AsyncMode = REACT_ASYNC_MODE_TYPE;
        var ConcurrentMode = REACT_CONCURRENT_MODE_TYPE;
        var ContextConsumer = REACT_CONTEXT_TYPE;
        var ContextProvider = REACT_PROVIDER_TYPE;
        var Element = REACT_ELEMENT_TYPE;
        var ForwardRef = REACT_FORWARD_REF_TYPE;
        var Fragment3 = REACT_FRAGMENT_TYPE;
        var Lazy = REACT_LAZY_TYPE;
        var Memo = REACT_MEMO_TYPE;
        var Portal = REACT_PORTAL_TYPE;
        var Profiler = REACT_PROFILER_TYPE;
        var StrictMode = REACT_STRICT_MODE_TYPE;
        var Suspense = REACT_SUSPENSE_TYPE;
        var hasWarnedAboutDeprecatedIsAsyncMode = false;
        function isAsyncMode(object) {
          {
            if (!hasWarnedAboutDeprecatedIsAsyncMode) {
              hasWarnedAboutDeprecatedIsAsyncMode = true;
              console["warn"]("The ReactIs.isAsyncMode() alias has been deprecated, and will be removed in React 17+. Update your code to use ReactIs.isConcurrentMode() instead. It has the exact same API.");
            }
          }
          return isConcurrentMode(object) || typeOf(object) === REACT_ASYNC_MODE_TYPE;
        }
        function isConcurrentMode(object) {
          return typeOf(object) === REACT_CONCURRENT_MODE_TYPE;
        }
        function isContextConsumer(object) {
          return typeOf(object) === REACT_CONTEXT_TYPE;
        }
        function isContextProvider(object) {
          return typeOf(object) === REACT_PROVIDER_TYPE;
        }
        function isElement(object) {
          return typeof object === "object" && object !== null && object.$$typeof === REACT_ELEMENT_TYPE;
        }
        function isForwardRef(object) {
          return typeOf(object) === REACT_FORWARD_REF_TYPE;
        }
        function isFragment(object) {
          return typeOf(object) === REACT_FRAGMENT_TYPE;
        }
        function isLazy(object) {
          return typeOf(object) === REACT_LAZY_TYPE;
        }
        function isMemo(object) {
          return typeOf(object) === REACT_MEMO_TYPE;
        }
        function isPortal(object) {
          return typeOf(object) === REACT_PORTAL_TYPE;
        }
        function isProfiler(object) {
          return typeOf(object) === REACT_PROFILER_TYPE;
        }
        function isStrictMode(object) {
          return typeOf(object) === REACT_STRICT_MODE_TYPE;
        }
        function isSuspense(object) {
          return typeOf(object) === REACT_SUSPENSE_TYPE;
        }
        exports.AsyncMode = AsyncMode;
        exports.ConcurrentMode = ConcurrentMode;
        exports.ContextConsumer = ContextConsumer;
        exports.ContextProvider = ContextProvider;
        exports.Element = Element;
        exports.ForwardRef = ForwardRef;
        exports.Fragment = Fragment3;
        exports.Lazy = Lazy;
        exports.Memo = Memo;
        exports.Portal = Portal;
        exports.Profiler = Profiler;
        exports.StrictMode = StrictMode;
        exports.Suspense = Suspense;
        exports.isAsyncMode = isAsyncMode;
        exports.isConcurrentMode = isConcurrentMode;
        exports.isContextConsumer = isContextConsumer;
        exports.isContextProvider = isContextProvider;
        exports.isElement = isElement;
        exports.isForwardRef = isForwardRef;
        exports.isFragment = isFragment;
        exports.isLazy = isLazy;
        exports.isMemo = isMemo;
        exports.isPortal = isPortal;
        exports.isProfiler = isProfiler;
        exports.isStrictMode = isStrictMode;
        exports.isSuspense = isSuspense;
        exports.isValidElementType = isValidElementType;
        exports.typeOf = typeOf;
      })();
    }
  }
});

// node_modules/react-is/index.js
var require_react_is = __commonJS({
  "node_modules/react-is/index.js"(exports, module) {
    "use strict";
    if (false) {
      module.exports = null;
    } else {
      module.exports = require_react_is_development();
    }
  }
});

// node_modules/object-assign/index.js
var require_object_assign = __commonJS({
  "node_modules/object-assign/index.js"(exports, module) {
    "use strict";
    var getOwnPropertySymbols = Object.getOwnPropertySymbols;
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    var propIsEnumerable = Object.prototype.propertyIsEnumerable;
    function toObject(val) {
      if (val === null || val === void 0) {
        throw new TypeError("Object.assign cannot be called with null or undefined");
      }
      return Object(val);
    }
    function shouldUseNative() {
      try {
        if (!Object.assign) {
          return false;
        }
        var test1 = new String("abc");
        test1[5] = "de";
        if (Object.getOwnPropertyNames(test1)[0] === "5") {
          return false;
        }
        var test2 = {};
        for (var i = 0; i < 10; i++) {
          test2["_" + String.fromCharCode(i)] = i;
        }
        var order2 = Object.getOwnPropertyNames(test2).map(function(n) {
          return test2[n];
        });
        if (order2.join("") !== "0123456789") {
          return false;
        }
        var test3 = {};
        "abcdefghijklmnopqrst".split("").forEach(function(letter) {
          test3[letter] = letter;
        });
        if (Object.keys(Object.assign({}, test3)).join("") !== "abcdefghijklmnopqrst") {
          return false;
        }
        return true;
      } catch (err) {
        return false;
      }
    }
    module.exports = shouldUseNative() ? Object.assign : function(target, source) {
      var from;
      var to = toObject(target);
      var symbols;
      for (var s = 1; s < arguments.length; s++) {
        from = Object(arguments[s]);
        for (var key in from) {
          if (hasOwnProperty.call(from, key)) {
            to[key] = from[key];
          }
        }
        if (getOwnPropertySymbols) {
          symbols = getOwnPropertySymbols(from);
          for (var i = 0; i < symbols.length; i++) {
            if (propIsEnumerable.call(from, symbols[i])) {
              to[symbols[i]] = from[symbols[i]];
            }
          }
        }
      }
      return to;
    };
  }
});

// node_modules/prop-types/lib/ReactPropTypesSecret.js
var require_ReactPropTypesSecret = __commonJS({
  "node_modules/prop-types/lib/ReactPropTypesSecret.js"(exports, module) {
    "use strict";
    var ReactPropTypesSecret = "SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED";
    module.exports = ReactPropTypesSecret;
  }
});

// node_modules/prop-types/lib/has.js
var require_has = __commonJS({
  "node_modules/prop-types/lib/has.js"(exports, module) {
    module.exports = Function.call.bind(Object.prototype.hasOwnProperty);
  }
});

// node_modules/prop-types/checkPropTypes.js
var require_checkPropTypes = __commonJS({
  "node_modules/prop-types/checkPropTypes.js"(exports, module) {
    "use strict";
    var printWarning = function() {
    };
    if (true) {
      ReactPropTypesSecret = require_ReactPropTypesSecret();
      loggedTypeFailures = {};
      has = require_has();
      printWarning = function(text) {
        var message2 = "Warning: " + text;
        if (typeof console !== "undefined") {
          console.error(message2);
        }
        try {
          throw new Error(message2);
        } catch (x) {
        }
      };
    }
    var ReactPropTypesSecret;
    var loggedTypeFailures;
    var has;
    function checkPropTypes(typeSpecs, values, location, componentName, getStack) {
      if (true) {
        for (var typeSpecName in typeSpecs) {
          if (has(typeSpecs, typeSpecName)) {
            var error;
            try {
              if (typeof typeSpecs[typeSpecName] !== "function") {
                var err = Error(
                  (componentName || "React class") + ": " + location + " type `" + typeSpecName + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + typeof typeSpecs[typeSpecName] + "`.This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`."
                );
                err.name = "Invariant Violation";
                throw err;
              }
              error = typeSpecs[typeSpecName](values, typeSpecName, componentName, location, null, ReactPropTypesSecret);
            } catch (ex) {
              error = ex;
            }
            if (error && !(error instanceof Error)) {
              printWarning(
                (componentName || "React class") + ": type specification of " + location + " `" + typeSpecName + "` is invalid; the type checker function must return `null` or an `Error` but returned a " + typeof error + ". You may have forgotten to pass an argument to the type checker creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and shape all require an argument)."
              );
            }
            if (error instanceof Error && !(error.message in loggedTypeFailures)) {
              loggedTypeFailures[error.message] = true;
              var stack = getStack ? getStack() : "";
              printWarning(
                "Failed " + location + " type: " + error.message + (stack != null ? stack : "")
              );
            }
          }
        }
      }
    }
    checkPropTypes.resetWarningCache = function() {
      if (true) {
        loggedTypeFailures = {};
      }
    };
    module.exports = checkPropTypes;
  }
});

// node_modules/prop-types/factoryWithTypeCheckers.js
var require_factoryWithTypeCheckers = __commonJS({
  "node_modules/prop-types/factoryWithTypeCheckers.js"(exports, module) {
    "use strict";
    var ReactIs = require_react_is();
    var assign = require_object_assign();
    var ReactPropTypesSecret = require_ReactPropTypesSecret();
    var has = require_has();
    var checkPropTypes = require_checkPropTypes();
    var printWarning = function() {
    };
    if (true) {
      printWarning = function(text) {
        var message2 = "Warning: " + text;
        if (typeof console !== "undefined") {
          console.error(message2);
        }
        try {
          throw new Error(message2);
        } catch (x) {
        }
      };
    }
    function emptyFunctionThatReturnsNull() {
      return null;
    }
    module.exports = function(isValidElement, throwOnDirectAccess) {
      var ITERATOR_SYMBOL = typeof Symbol === "function" && Symbol.iterator;
      var FAUX_ITERATOR_SYMBOL = "@@iterator";
      function getIteratorFn(maybeIterable) {
        var iteratorFn = maybeIterable && (ITERATOR_SYMBOL && maybeIterable[ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL]);
        if (typeof iteratorFn === "function") {
          return iteratorFn;
        }
      }
      var ANONYMOUS = "<<anonymous>>";
      var ReactPropTypes = {
        array: createPrimitiveTypeChecker("array"),
        bigint: createPrimitiveTypeChecker("bigint"),
        bool: createPrimitiveTypeChecker("boolean"),
        func: createPrimitiveTypeChecker("function"),
        number: createPrimitiveTypeChecker("number"),
        object: createPrimitiveTypeChecker("object"),
        string: createPrimitiveTypeChecker("string"),
        symbol: createPrimitiveTypeChecker("symbol"),
        any: createAnyTypeChecker(),
        arrayOf: createArrayOfTypeChecker,
        element: createElementTypeChecker(),
        elementType: createElementTypeTypeChecker(),
        instanceOf: createInstanceTypeChecker,
        node: createNodeChecker(),
        objectOf: createObjectOfTypeChecker,
        oneOf: createEnumTypeChecker,
        oneOfType: createUnionTypeChecker,
        shape: createShapeTypeChecker,
        exact: createStrictShapeTypeChecker
      };
      function is(x, y) {
        if (x === y) {
          return x !== 0 || 1 / x === 1 / y;
        } else {
          return x !== x && y !== y;
        }
      }
      function PropTypeError(message2, data) {
        this.message = message2;
        this.data = data && typeof data === "object" ? data : {};
        this.stack = "";
      }
      PropTypeError.prototype = Error.prototype;
      function createChainableTypeChecker(validate) {
        if (true) {
          var manualPropTypeCallCache = {};
          var manualPropTypeWarningCount = 0;
        }
        function checkType(isRequired, props, propName, componentName, location, propFullName, secret) {
          componentName = componentName || ANONYMOUS;
          propFullName = propFullName || propName;
          if (secret !== ReactPropTypesSecret) {
            if (throwOnDirectAccess) {
              var err = new Error(
                "Calling PropTypes validators directly is not supported by the `prop-types` package. Use `PropTypes.checkPropTypes()` to call them. Read more at http://fb.me/use-check-prop-types"
              );
              err.name = "Invariant Violation";
              throw err;
            } else if (typeof console !== "undefined") {
              var cacheKey = componentName + ":" + propName;
              if (!manualPropTypeCallCache[cacheKey] && // Avoid spamming the console because they are often not actionable except for lib authors
              manualPropTypeWarningCount < 3) {
                printWarning(
                  "You are manually calling a React.PropTypes validation function for the `" + propFullName + "` prop on `" + componentName + "`. This is deprecated and will throw in the standalone `prop-types` package. You may be seeing this warning due to a third-party PropTypes library. See https://fb.me/react-warning-dont-call-proptypes for details."
                );
                manualPropTypeCallCache[cacheKey] = true;
                manualPropTypeWarningCount++;
              }
            }
          }
          if (props[propName] == null) {
            if (isRequired) {
              if (props[propName] === null) {
                return new PropTypeError("The " + location + " `" + propFullName + "` is marked as required " + ("in `" + componentName + "`, but its value is `null`."));
              }
              return new PropTypeError("The " + location + " `" + propFullName + "` is marked as required in " + ("`" + componentName + "`, but its value is `undefined`."));
            }
            return null;
          } else {
            return validate(props, propName, componentName, location, propFullName);
          }
        }
        var chainedCheckType = checkType.bind(null, false);
        chainedCheckType.isRequired = checkType.bind(null, true);
        return chainedCheckType;
      }
      function createPrimitiveTypeChecker(expectedType) {
        function validate(props, propName, componentName, location, propFullName, secret) {
          var propValue = props[propName];
          var propType = getPropType(propValue);
          if (propType !== expectedType) {
            var preciseType = getPreciseType(propValue);
            return new PropTypeError(
              "Invalid " + location + " `" + propFullName + "` of type " + ("`" + preciseType + "` supplied to `" + componentName + "`, expected ") + ("`" + expectedType + "`."),
              { expectedType }
            );
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function createAnyTypeChecker() {
        return createChainableTypeChecker(emptyFunctionThatReturnsNull);
      }
      function createArrayOfTypeChecker(typeChecker) {
        function validate(props, propName, componentName, location, propFullName) {
          if (typeof typeChecker !== "function") {
            return new PropTypeError("Property `" + propFullName + "` of component `" + componentName + "` has invalid PropType notation inside arrayOf.");
          }
          var propValue = props[propName];
          if (!Array.isArray(propValue)) {
            var propType = getPropType(propValue);
            return new PropTypeError("Invalid " + location + " `" + propFullName + "` of type " + ("`" + propType + "` supplied to `" + componentName + "`, expected an array."));
          }
          for (var i = 0; i < propValue.length; i++) {
            var error = typeChecker(propValue, i, componentName, location, propFullName + "[" + i + "]", ReactPropTypesSecret);
            if (error instanceof Error) {
              return error;
            }
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function createElementTypeChecker() {
        function validate(props, propName, componentName, location, propFullName) {
          var propValue = props[propName];
          if (!isValidElement(propValue)) {
            var propType = getPropType(propValue);
            return new PropTypeError("Invalid " + location + " `" + propFullName + "` of type " + ("`" + propType + "` supplied to `" + componentName + "`, expected a single ReactElement."));
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function createElementTypeTypeChecker() {
        function validate(props, propName, componentName, location, propFullName) {
          var propValue = props[propName];
          if (!ReactIs.isValidElementType(propValue)) {
            var propType = getPropType(propValue);
            return new PropTypeError("Invalid " + location + " `" + propFullName + "` of type " + ("`" + propType + "` supplied to `" + componentName + "`, expected a single ReactElement type."));
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function createInstanceTypeChecker(expectedClass) {
        function validate(props, propName, componentName, location, propFullName) {
          if (!(props[propName] instanceof expectedClass)) {
            var expectedClassName = expectedClass.name || ANONYMOUS;
            var actualClassName = getClassName(props[propName]);
            return new PropTypeError("Invalid " + location + " `" + propFullName + "` of type " + ("`" + actualClassName + "` supplied to `" + componentName + "`, expected ") + ("instance of `" + expectedClassName + "`."));
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function createEnumTypeChecker(expectedValues) {
        if (!Array.isArray(expectedValues)) {
          if (true) {
            if (arguments.length > 1) {
              printWarning(
                "Invalid arguments supplied to oneOf, expected an array, got " + arguments.length + " arguments. A common mistake is to write oneOf(x, y, z) instead of oneOf([x, y, z])."
              );
            } else {
              printWarning("Invalid argument supplied to oneOf, expected an array.");
            }
          }
          return emptyFunctionThatReturnsNull;
        }
        function validate(props, propName, componentName, location, propFullName) {
          var propValue = props[propName];
          for (var i = 0; i < expectedValues.length; i++) {
            if (is(propValue, expectedValues[i])) {
              return null;
            }
          }
          var valuesString = JSON.stringify(expectedValues, function replacer(key, value) {
            var type = getPreciseType(value);
            if (type === "symbol") {
              return String(value);
            }
            return value;
          });
          return new PropTypeError("Invalid " + location + " `" + propFullName + "` of value `" + String(propValue) + "` " + ("supplied to `" + componentName + "`, expected one of " + valuesString + "."));
        }
        return createChainableTypeChecker(validate);
      }
      function createObjectOfTypeChecker(typeChecker) {
        function validate(props, propName, componentName, location, propFullName) {
          if (typeof typeChecker !== "function") {
            return new PropTypeError("Property `" + propFullName + "` of component `" + componentName + "` has invalid PropType notation inside objectOf.");
          }
          var propValue = props[propName];
          var propType = getPropType(propValue);
          if (propType !== "object") {
            return new PropTypeError("Invalid " + location + " `" + propFullName + "` of type " + ("`" + propType + "` supplied to `" + componentName + "`, expected an object."));
          }
          for (var key in propValue) {
            if (has(propValue, key)) {
              var error = typeChecker(propValue, key, componentName, location, propFullName + "." + key, ReactPropTypesSecret);
              if (error instanceof Error) {
                return error;
              }
            }
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function createUnionTypeChecker(arrayOfTypeCheckers) {
        if (!Array.isArray(arrayOfTypeCheckers)) {
          true ? printWarning("Invalid argument supplied to oneOfType, expected an instance of array.") : void 0;
          return emptyFunctionThatReturnsNull;
        }
        for (var i = 0; i < arrayOfTypeCheckers.length; i++) {
          var checker = arrayOfTypeCheckers[i];
          if (typeof checker !== "function") {
            printWarning(
              "Invalid argument supplied to oneOfType. Expected an array of check functions, but received " + getPostfixForTypeWarning(checker) + " at index " + i + "."
            );
            return emptyFunctionThatReturnsNull;
          }
        }
        function validate(props, propName, componentName, location, propFullName) {
          var expectedTypes = [];
          for (var i2 = 0; i2 < arrayOfTypeCheckers.length; i2++) {
            var checker2 = arrayOfTypeCheckers[i2];
            var checkerResult = checker2(props, propName, componentName, location, propFullName, ReactPropTypesSecret);
            if (checkerResult == null) {
              return null;
            }
            if (checkerResult.data && has(checkerResult.data, "expectedType")) {
              expectedTypes.push(checkerResult.data.expectedType);
            }
          }
          var expectedTypesMessage = expectedTypes.length > 0 ? ", expected one of type [" + expectedTypes.join(", ") + "]" : "";
          return new PropTypeError("Invalid " + location + " `" + propFullName + "` supplied to " + ("`" + componentName + "`" + expectedTypesMessage + "."));
        }
        return createChainableTypeChecker(validate);
      }
      function createNodeChecker() {
        function validate(props, propName, componentName, location, propFullName) {
          if (!isNode(props[propName])) {
            return new PropTypeError("Invalid " + location + " `" + propFullName + "` supplied to " + ("`" + componentName + "`, expected a ReactNode."));
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function invalidValidatorError(componentName, location, propFullName, key, type) {
        return new PropTypeError(
          (componentName || "React class") + ": " + location + " type `" + propFullName + "." + key + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + type + "`."
        );
      }
      function createShapeTypeChecker(shapeTypes) {
        function validate(props, propName, componentName, location, propFullName) {
          var propValue = props[propName];
          var propType = getPropType(propValue);
          if (propType !== "object") {
            return new PropTypeError("Invalid " + location + " `" + propFullName + "` of type `" + propType + "` " + ("supplied to `" + componentName + "`, expected `object`."));
          }
          for (var key in shapeTypes) {
            var checker = shapeTypes[key];
            if (typeof checker !== "function") {
              return invalidValidatorError(componentName, location, propFullName, key, getPreciseType(checker));
            }
            var error = checker(propValue, key, componentName, location, propFullName + "." + key, ReactPropTypesSecret);
            if (error) {
              return error;
            }
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function createStrictShapeTypeChecker(shapeTypes) {
        function validate(props, propName, componentName, location, propFullName) {
          var propValue = props[propName];
          var propType = getPropType(propValue);
          if (propType !== "object") {
            return new PropTypeError("Invalid " + location + " `" + propFullName + "` of type `" + propType + "` " + ("supplied to `" + componentName + "`, expected `object`."));
          }
          var allKeys = assign({}, props[propName], shapeTypes);
          for (var key in allKeys) {
            var checker = shapeTypes[key];
            if (has(shapeTypes, key) && typeof checker !== "function") {
              return invalidValidatorError(componentName, location, propFullName, key, getPreciseType(checker));
            }
            if (!checker) {
              return new PropTypeError(
                "Invalid " + location + " `" + propFullName + "` key `" + key + "` supplied to `" + componentName + "`.\nBad object: " + JSON.stringify(props[propName], null, "  ") + "\nValid keys: " + JSON.stringify(Object.keys(shapeTypes), null, "  ")
              );
            }
            var error = checker(propValue, key, componentName, location, propFullName + "." + key, ReactPropTypesSecret);
            if (error) {
              return error;
            }
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function isNode(propValue) {
        switch (typeof propValue) {
          case "number":
          case "string":
          case "undefined":
            return true;
          case "boolean":
            return !propValue;
          case "object":
            if (Array.isArray(propValue)) {
              return propValue.every(isNode);
            }
            if (propValue === null || isValidElement(propValue)) {
              return true;
            }
            var iteratorFn = getIteratorFn(propValue);
            if (iteratorFn) {
              var iterator = iteratorFn.call(propValue);
              var step;
              if (iteratorFn !== propValue.entries) {
                while (!(step = iterator.next()).done) {
                  if (!isNode(step.value)) {
                    return false;
                  }
                }
              } else {
                while (!(step = iterator.next()).done) {
                  var entry = step.value;
                  if (entry) {
                    if (!isNode(entry[1])) {
                      return false;
                    }
                  }
                }
              }
            } else {
              return false;
            }
            return true;
          default:
            return false;
        }
      }
      function isSymbol(propType, propValue) {
        if (propType === "symbol") {
          return true;
        }
        if (!propValue) {
          return false;
        }
        if (propValue["@@toStringTag"] === "Symbol") {
          return true;
        }
        if (typeof Symbol === "function" && propValue instanceof Symbol) {
          return true;
        }
        return false;
      }
      function getPropType(propValue) {
        var propType = typeof propValue;
        if (Array.isArray(propValue)) {
          return "array";
        }
        if (propValue instanceof RegExp) {
          return "object";
        }
        if (isSymbol(propType, propValue)) {
          return "symbol";
        }
        return propType;
      }
      function getPreciseType(propValue) {
        if (typeof propValue === "undefined" || propValue === null) {
          return "" + propValue;
        }
        var propType = getPropType(propValue);
        if (propType === "object") {
          if (propValue instanceof Date) {
            return "date";
          } else if (propValue instanceof RegExp) {
            return "regexp";
          }
        }
        return propType;
      }
      function getPostfixForTypeWarning(value) {
        var type = getPreciseType(value);
        switch (type) {
          case "array":
          case "object":
            return "an " + type;
          case "boolean":
          case "date":
          case "regexp":
            return "a " + type;
          default:
            return type;
        }
      }
      function getClassName(propValue) {
        if (!propValue.constructor || !propValue.constructor.name) {
          return ANONYMOUS;
        }
        return propValue.constructor.name;
      }
      ReactPropTypes.checkPropTypes = checkPropTypes;
      ReactPropTypes.resetWarningCache = checkPropTypes.resetWarningCache;
      ReactPropTypes.PropTypes = ReactPropTypes;
      return ReactPropTypes;
    };
  }
});

// node_modules/prop-types/index.js
var require_prop_types = __commonJS({
  "node_modules/prop-types/index.js"(exports, module) {
    if (true) {
      ReactIs = require_react_is();
      throwOnDirectAccess = true;
      module.exports = require_factoryWithTypeCheckers()(ReactIs.isElement, throwOnDirectAccess);
    } else {
      module.exports = null();
    }
    var ReactIs;
    var throwOnDirectAccess;
  }
});

// node_modules/@tauri-apps/api/external/tslib/tslib.es6.js
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
var init_tslib_es6 = __esm({
  "node_modules/@tauri-apps/api/external/tslib/tslib.es6.js"() {
  }
});

// node_modules/@tauri-apps/api/core.js
function transformCallback(callback, once = false) {
  return window.__TAURI_INTERNALS__.transformCallback(callback, once);
}
async function invoke2(cmd, args = {}, options) {
  return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
}
var _Channel_instances, _Channel_onmessage, _Channel_nextMessageIndex, _Channel_pendingMessages, _Channel_messageEndIndex, _Channel_deliver, _Resource_rid, SERIALIZE_TO_IPC_FN, Channel, Resource;
var init_core = __esm({
  "node_modules/@tauri-apps/api/core.js"() {
    init_tslib_es6();
    SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
    Channel = class {
      constructor(onmessage) {
        _Channel_instances.add(this);
        _Channel_onmessage.set(this, void 0);
        _Channel_nextMessageIndex.set(this, 0);
        _Channel_pendingMessages.set(this, []);
        _Channel_messageEndIndex.set(this, void 0);
        __classPrivateFieldSet(this, _Channel_onmessage, onmessage || (() => {
        }), "f");
        this.id = transformCallback((rawMessage) => {
          const index = rawMessage.index;
          if ("end" in rawMessage) {
            if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
              this.cleanupCallback();
            } else {
              __classPrivateFieldSet(this, _Channel_messageEndIndex, index, "f");
            }
            return;
          }
          const message2 = rawMessage.message;
          if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
            __classPrivateFieldGet(this, _Channel_instances, "m", _Channel_deliver).call(this, message2);
            __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
            while (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") in __classPrivateFieldGet(this, _Channel_pendingMessages, "f")) {
              const message3 = __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
              __classPrivateFieldGet(this, _Channel_instances, "m", _Channel_deliver).call(this, message3);
              delete __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
              __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
            }
            if (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") === __classPrivateFieldGet(this, _Channel_messageEndIndex, "f")) {
              this.cleanupCallback();
            }
          } else {
            __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[index] = message2;
          }
        });
      }
      cleanupCallback() {
        window.__TAURI_INTERNALS__.unregisterCallback(this.id);
      }
      /**
       * The handler called for every message sent by the Rust side of this channel.
       *
       * Assigning a new handler replaces the previous one; messages that arrived
       * before a handler was set are not replayed, so set it (or pass it to the
       * constructor) before sending the channel to the backend.
       */
      set onmessage(handler) {
        __classPrivateFieldSet(this, _Channel_onmessage, handler, "f");
      }
      get onmessage() {
        return __classPrivateFieldGet(this, _Channel_onmessage, "f");
      }
      [(_Channel_onmessage = /* @__PURE__ */ new WeakMap(), _Channel_nextMessageIndex = /* @__PURE__ */ new WeakMap(), _Channel_pendingMessages = /* @__PURE__ */ new WeakMap(), _Channel_messageEndIndex = /* @__PURE__ */ new WeakMap(), _Channel_instances = /* @__PURE__ */ new WeakSet(), _Channel_deliver = function _Channel_deliver2(message2) {
        try {
          __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message2);
        } catch (error) {
          queueMicrotask(() => {
            throw error;
          });
        }
      }, SERIALIZE_TO_IPC_FN)]() {
        return `__CHANNEL__:${this.id}`;
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    Resource = class {
      get rid() {
        return __classPrivateFieldGet(this, _Resource_rid, "f");
      }
      constructor(rid) {
        _Resource_rid.set(this, void 0);
        __classPrivateFieldSet(this, _Resource_rid, rid, "f");
      }
      /**
       * Destroys and cleans up this resource from memory.
       * **You should not call any method on this object anymore and should drop any reference to it.**
       *
       * @remarks Uses the `core:resources:allow-close` permission, which is part of
       * the `core:resources:default` permission set enabled by default.
       */
      async close() {
        return invoke2("plugin:resources|close", {
          rid: this.rid
        });
      }
      async [(_Resource_rid = /* @__PURE__ */ new WeakMap(), Symbol.asyncDispose)]() {
        await this.close();
      }
    };
  }
});

// node_modules/@tauri-apps/plugin-dialog/dist-js/index.js
var dist_js_exports = {};
__export(dist_js_exports, {
  ask: () => ask,
  confirm: () => confirm2,
  message: () => message,
  open: () => open,
  save: () => save
});
function buttonsToRust(buttons) {
  if (buttons === void 0) {
    return void 0;
  }
  if (typeof buttons === "string") {
    return buttons;
  } else if ("ok" in buttons && "cancel" in buttons) {
    return { OkCancelCustom: [buttons.ok, buttons.cancel] };
  } else if ("yes" in buttons && "no" in buttons && "cancel" in buttons) {
    return {
      YesNoCancelCustom: [buttons.yes, buttons.no, buttons.cancel]
    };
  } else if ("ok" in buttons) {
    return { OkCustom: buttons.ok };
  }
  return void 0;
}
async function open(options = {}) {
  if (typeof options === "object") {
    Object.freeze(options);
  }
  return await invoke2("plugin:dialog|open", { options });
}
async function save(options = {}) {
  if (typeof options === "object") {
    Object.freeze(options);
  }
  return await invoke2("plugin:dialog|save", { options });
}
async function messageCommand(message2, options) {
  return await invoke2("plugin:dialog|message", {
    message: message2,
    title: options?.title,
    kind: options?.kind,
    buttons: buttonsToRust(options?.buttons)
  });
}
async function message(message2, options) {
  const opts = typeof options === "string" ? { title: options } : options;
  if (opts && !opts.buttons && opts.okLabel) {
    opts.buttons = { ok: opts.okLabel };
  }
  return messageCommand(message2, opts);
}
async function ask(message2, options) {
  const opts = typeof options === "string" ? { title: options } : options;
  const customButtons = opts?.okLabel || opts?.cancelLabel;
  const okLabel = opts?.okLabel ?? "Yes";
  return await messageCommand(message2, {
    title: opts?.title,
    kind: opts?.kind,
    buttons: customButtons ? { ok: okLabel, cancel: opts.cancelLabel ?? "No" } : "YesNo"
  }) === okLabel;
}
async function confirm2(message2, options) {
  const opts = typeof options === "string" ? { title: options } : options;
  const customButtons = opts?.okLabel || opts?.cancelLabel;
  const okLabel = opts?.okLabel ?? "Ok";
  return await messageCommand(message2, {
    title: opts?.title,
    kind: opts?.kind,
    buttons: customButtons ? { ok: okLabel, cancel: opts.cancelLabel ?? "Cancel" } : "OkCancel"
  }) === okLabel;
}
var init_dist_js = __esm({
  "node_modules/@tauri-apps/plugin-dialog/dist-js/index.js"() {
    init_core();
  }
});

// src/index.tsx
import { useState as useState13 } from "react";

// src/SettingsPage.tsx
import { useState as useState12, useEffect as useEffect10, useRef as useRef3 } from "react";

// locales/zh-CN.json
var zh_CN_default = {
  title: "\u8BBE\u7F6E",
  search: "\u641C\u7D22\u8BBE\u7F6E...",
  aiEngine: {
    title: "AI \u5F15\u64CE",
    authStatus: "\u8BA4\u8BC1\u72B6\u6001",
    loggedIn: "\u5DF2\u767B\u5F55",
    notLoggedIn: "\u672A\u767B\u5F55",
    checkingAuth: "\u68C0\u67E5\u4E2D...",
    authUnknown: "\u672A\u77E5",
    openInstallPage: "",
    builtinHint: "",
    installing: "",
    updateAction: "",
    installAction: "",
    uninstalling: "",
    uninstallAction: "",
    installPreparing: "",
    installHint: ""
  },
  currentGroup: "\u5F53\u524D\u5206\u7EC4\uFF1A{{name}}",
  saveTab: "\u4FDD\u5B58{{name}}",
  nav: {
    general: "\u901A\u7528",
    theme: "\u4E3B\u9898",
    systemPrompt: "\u7CFB\u7EDF\u63D0\u793A\u8BCD",
    promptSnippet: "\u5FEB\u6377\u7247\u6BB5",
    aiEngine: "AI \u5F15\u64CE",
    modelProvider: "\u6A21\u578B\u4F9B\u5E94\u5546",
    translate: "\u7FFB\u8BD1",
    scheduler: "\u5B9A\u65F6\u4EFB\u52A1",
    plugins: "\u63D2\u4EF6",
    mcp: "MCP \u670D\u52A1\u5668",
    web: "Web \u670D\u52A1",
    appUpdate: "\u5E94\u7528\u66F4\u65B0",
    personalHub: "\u4E2A\u4EBA\u7A7A\u95F4",
    tokenStats: "Token \u7EDF\u8BA1",
    performance: "\u6027\u80FD\u4E0E\u8D44\u6E90",
    routeLog: "\u8DEF\u7531\u65E5\u5FD7",
    providerStats: "\u4F9B\u5E94\u5546\u8C03\u7528\u7EDF\u8BA1"
  },
  tokenStats: {
    empty: "\u6682\u65E0 Token \u7EDF\u8BA1\u6570\u636E",
    emptyHint: "\u53D1\u9001\u6D88\u606F\u540E\uFF0C\u4EE3\u7406\u4F1A\u81EA\u52A8\u8BB0\u5F55 API \u7528\u91CF",
    totalRequests: "\u8BF7\u6C42\u6570",
    totalInput: "\u8F93\u5165 Token",
    totalOutput: "\u8F93\u51FA Token",
    totalCache: "\u7F13\u5B58",
    cacheHitRate: "\u7F13\u5B58\u547D\u4E2D",
    cacheHitRateShort: "\u547D\u4E2D\u7387",
    cacheHitRateHint: "\u7F13\u5B58\u547D\u4E2D\u7387 = \u7F13\u5B58\u8BFB\u53D6 / (\u8F93\u5165 + \u7F13\u5B58\u8BFB\u53D6)\uFF0C\u6210\u672C\u53E3\u5F84",
    totalCost: "\u603B\u82B1\u8D39",
    overview: "\u6982\u89C8",
    model: "\u6309\u6A21\u578B",
    time: "\u6309\u65F6\u95F4",
    topSessions: "Top \u8BF7\u6C42",
    topModels: "\u6A21\u578B\u7528\u91CF Top 5",
    noModelData: "\u6682\u65E0\u6A21\u578B\u7EA7\u6570\u636E",
    engineDistribution: "\u5F15\u64CE\u5206\u5E03",
    noEngineData: "\u6682\u65E0\u5F15\u64CE\u6570\u636E",
    requests: "\u8BF7\u6C42",
    input: "\u8F93\u5165",
    output: "\u8F93\u51FA",
    cache: "\u7F13\u5B58",
    cost: "\u82B1\u8D39",
    engine: "\u5F15\u64CE",
    noTimeData: "\u8BE5\u65F6\u95F4\u8303\u56F4\u5185\u65E0\u6570\u636E",
    noSessions: "\u6682\u65E0\u8BF7\u6C42\u6570\u636E",
    pageInfo: "\u7B2C {{page}} \u9875",
    prev: "\u4E0A\u4E00\u9875",
    next: "\u4E0B\u4E00\u9875",
    allModels: "\u5168\u90E8\u6A21\u578B",
    refresh: "\u5237\u65B0",
    preset: {
      today: "\u4ECA\u5929",
      yesterday: "\u6628\u5929",
      dayBefore: "\u524D\u5929",
      rolling7: "\u8FD17\u5929",
      rolling30: "\u8FD130\u5929",
      lastWeek: "\u4E0A\u5468",
      lastMonth: "\u4E0A\u6708",
      all: "\u5168\u90E8"
    },
    presetGroup: {
      day: "\u5355\u65E5",
      rolling: "\u533A\u95F4",
      period: "\u5468\u671F",
      all: "\u5168\u90E8"
    },
    timeRange: {
      placeholder: "\u9009\u62E9\u65F6\u95F4\u8303\u56F4",
      clear: "\u6E05\u7A7A",
      pickStart: "\u70B9\u51FB\u5F00\u59CB\u65E5\u671F\uFF0C\u518D\u70B9\u7ED3\u675F\u65E5\u671F",
      pickEnd: "\u5DF2\u9009\u5F00\u59CB {{date}}\uFF0C\u8BF7\u70B9\u7ED3\u675F\u65E5\u671F",
      weekdays: [
        "\u4E00",
        "\u4E8C",
        "\u4E09",
        "\u56DB",
        "\u4E94",
        "\u516D",
        "\u65E5"
      ]
    }
  },
  messages: {
    saved: "\u5DF2\u4FDD\u5B58",
    configSavedDesc: "\u914D\u7F6E\u5DF2\u6210\u529F\u4FDD\u5B58",
    saveFailed: "\u4FDD\u5B58\u5931\u8D25"
  },
  plugins: {
    description: "\u7BA1\u7406 Polaris \u5185\u7F6E\u63D2\u4EF6\u548C\u5DF2\u53D1\u73B0\u63D2\u4EF6\u7684\u754C\u9762\u5165\u53E3\u4E0E MCP \u80FD\u529B\u3002\u5F53\u524D\u72B6\u6001\u4F1A\u7ACB\u5373\u4FDD\u5B58\u5230\u672C\u5730\u3002",
    discoverySummary: "\u5DF2\u53D1\u73B0 {{count}} \u4E2A\u5B89\u88C5\u63D2\u4EF6\uFF0C{{issues}} \u6761\u8BCA\u65AD",
    discoveryError: "\u63D2\u4EF6\u53D1\u73B0\u5931\u8D25\uFF1A{{error}}",
    refreshDiscovery: "\u5237\u65B0\u5B89\u88C5\u63D2\u4EF6",
    refreshingDiscovery: "\u5237\u65B0\u4E2D...",
    discoveryIssuesTitle: "Manifest \u8BCA\u65AD",
    builtin: "\u5185\u7F6E",
    userInstalled: "\u7528\u6237\u5B89\u88C5",
    projectInstalled: "\u9879\u76EE\u63D2\u4EF6",
    enablePlugin: "\u542F\u7528\u63D2\u4EF6",
    enabled: "\u5DF2\u542F\u7528",
    disabled: "\u5DF2\u7981\u7528",
    coreLocked: "\u6838\u5FC3\u63D2\u4EF6\u627F\u8F7D\u57FA\u7840\u9762\u677F\u5165\u53E3\uFF0C\u5F53\u524D\u7248\u672C\u4E0D\u53EF\u7981\u7528\u3002",
    uiSurface: "\u53EF\u89C6\u5316\u6A21\u5757",
    mcpSurface: "MCP \u670D\u52A1",
    viewCount: "{{count}} \u4E2A\u5165\u53E3",
    mcpCount: "{{count}} \u4E2A\u670D\u52A1",
    mcpRuntimePlan: "MCP \u8FD0\u884C\u65F6\u8BA1\u5212",
    mcpRuntimeSummary: "{{enabled}} \u4E2A\u542F\u7528\uFF0C{{disabled}} \u4E2A\u7981\u7528",
    enableAllMcp: "\u542F\u7528\u5168\u90E8",
    permissionsTitle: "\u6743\u9650",
    noPermissions: "\u65E0\u989D\u5916\u6743\u9650",
    reset: "\u91CD\u7F6E",
    checkUpdate: "\u68C0\u67E5\u66F4\u65B0",
    checkingUpdate: "\u68C0\u67E5\u4E2D...",
    updateAvailable: "\u53D1\u73B0\u66F4\u65B0\uFF1A{{current}} -> {{latest}}",
    noUpdateAvailable: "\u672A\u53D1\u73B0\u66F4\u65B0\uFF0C\u5F53\u524D\u7248\u672C\uFF1A{{version}}",
    updateUnavailable: "\u65E0\u6CD5\u68C0\u67E5\u66F4\u65B0",
    origin: {
      repository: "\u4ED3\u5E93",
      homepage: "\u4E3B\u9875",
      updateUrl: "\u66F4\u65B0\u6E90"
    },
    permissions: {
      workspaceRead: "\u8BFB\u53D6\u5DE5\u4F5C\u533A",
      workspaceWrite: "\u5199\u5165\u5DE5\u4F5C\u533A",
      appConfigRead: "\u8BFB\u53D6\u5E94\u7528\u914D\u7F6E",
      appConfigWrite: "\u5199\u5165\u5E94\u7528\u914D\u7F6E",
      network: "\u7F51\u7EDC\u8BBF\u95EE",
      aiToolAccess: "AI \u5DE5\u5177\u8BBF\u95EE"
    },
    marketplaceBannerTitle: "Polaris \u63D2\u4EF6\u5546\u57CE",
    marketplaceBannerDesc: "\u6D4F\u89C8\u3001\u641C\u7D22\u5E76\u4E00\u952E\u5B89\u88C5\u793E\u533A\u63D2\u4EF6\uFF0C\u7BA1\u7406\u4E0E\u66F4\u65B0\u5DF2\u88C5\u63D2\u4EF6\u3002",
    marketplaceInstall: "\u5B89\u88C5\u5546\u57CE",
    marketplaceInstalling: "\u5B89\u88C5\u4E2D\u2026",
    marketplaceInstallSucceeded: "\u63D2\u4EF6\u5546\u57CE\u5B89\u88C5\u6210\u529F",
    selectPluginDirectory: "",
    installFailed: "",
    installSucceeded: "",
    selectPluginPackage: "",
    uninstallConfirm: "",
    uninstallingDev: "",
    uninstalling: "",
    uninstallFailed: "",
    uninstallSucceeded: "",
    selectDevPluginDirectory: "",
    devLinkFailed: "",
    devLinkSucceeded: "",
    forceUninstallConfirm: "",
    forceUninstalling: "",
    forceUninstallSucceeded: "",
    applyUpdateConfirm: "",
    updateApplyFailed: "",
    updateApplySucceeded: "",
    mcpHealthError: "",
    installDirectoryTitle: "",
    projectInstallUnavailable: "",
    installLocationsUnavailable: "",
    userInstallScope: "",
    projectInstallScope: "",
    openInstallDirectory: "",
    installFromDirectory: "",
    installFromPackage: "",
    devLinkHint: "",
    devLink: "",
    remoteSourcePlaceholder: "",
    installRemote: "",
    guideTitle: "",
    deprecated: "",
    devBadgeHint: "",
    devBadge: "",
    engineCount: "",
    devSourceLabel: "",
    deprecatedHint: "",
    noViews: "",
    noMcpServers: "",
    aiToolsSurface: "",
    refreshAiTools: "",
    aiToolsInjected: "",
    aiToolsLazy: "",
    aiToolsUnknown: "",
    noAiTools: "",
    engineSurface: "",
    noEngines: "",
    capabilitiesTitle: "",
    capOverride: "",
    uninstall: "",
    forceUninstall: "",
    uninstallDev: "",
    devSkipUpdate: "",
    applyingUpdate: "",
    applyUpdate: ""
  },
  engines: {
    claudeCode: {
      name: "Claude Code",
      description: "Anthropic \u5B98\u65B9 CLI \u5DE5\u5177"
    },
    simpleAi: {
      name: "Simple AI",
      description: "\u8F7B\u91CF\u7EA7 AI \u52A9\u624B \u2014 \u4F7F\u7528\u6A21\u578B\u4F9B\u5E94\u5546\u914D\u7F6E\uFF0C\u5185\u7F6E bash/\u6587\u4EF6\u5DE5\u5177\uFF0C\u65E0\u9700\u5B89\u88C5 CLI"
    }
  },
  modelProfile: {
    title: "\u6A21\u578B Profile",
    add: "\u6DFB\u52A0",
    edit: "\u7F16\u8F91",
    save: "\u4FDD\u5B58",
    delete: "\u5220\u9664",
    duplicate: "\u590D\u5236",
    profileName: "Profile \u540D\u79F0",
    baseUrl: "API \u7AEF\u70B9 URL (\u5982 https://api.siliconflow.cn)",
    apiKey: "API Key",
    showApiKey: "\u663E\u793A\u539F\u6587",
    hideApiKey: "\u9690\u85CF\u539F\u6587",
    modelName: "\u6A21\u578B\u540D\u79F0 (\u5982 glm-4)",
    description: "\u63CF\u8FF0 (\u53EF\u9009)",
    noProfiles: "\u6682\u65E0\u6A21\u578B Profile\uFF0C\u70B9\u51FB\u6DFB\u52A0\u914D\u7F6E\u7B2C\u4E09\u65B9\u6A21\u578B\u7AEF\u70B9",
    fromPreset: "\u4ECE\u9884\u8BBE\u5BFC\u5165",
    presetHint: "\u9009\u62E9\u5E38\u7528\u4F9B\u5E94\u5546\u4E00\u952E\u586B\u5145\u8868\u5355\uFF0C\u7A0D\u540E\u8F93\u5165 API Key",
    testConnection: "\u6D4B\u8BD5\u8FDE\u63A5",
    testSuccessTitle: "\u8FDE\u63A5\u6210\u529F",
    testSuccessDesc: "\u300C{{name}}\u300D\u7AEF\u70B9\u53EF\u6B63\u5E38\u8BBF\u95EE",
    testFailedTitle: "\u8FDE\u63A5\u5931\u8D25",
    testErrorTitle: "\u6D4B\u8BD5\u5F02\u5E38",
    testNetworkError: "\u65E0\u6CD5\u8FDE\u63A5\u5230\u7AEF\u70B9\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u6216 Base URL \u662F\u5426\u6B63\u786E",
    testAuthFailed: "\u9274\u6743\u5931\u8D25\uFF08HTTP {{status}}\uFF09\uFF0C\u8BF7\u68C0\u67E5 API Key \u662F\u5426\u6B63\u786E",
    testNotFound: "\u7AEF\u70B9\u4E0D\u5B58\u5728\uFF08HTTP {{status}}\uFF09\uFF0C\u8BF7\u68C0\u67E5 Base URL \u4E0E\u8DEF\u5F84",
    testServerError: "\u7AEF\u70B9\u670D\u52A1\u5F02\u5E38\uFF08HTTP {{status}}\uFF09\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
    testBadStatus: "\u7AEF\u70B9\u8FD4\u56DE\u5F02\u5E38\u72B6\u6001\uFF08HTTP {{status}}\uFF09",
    tabDescription: "\u7BA1\u7406\u7B2C\u4E09\u65B9\u6A21\u578B\u4F9B\u5E94\u5546\u7AEF\u70B9\uFF0C\u53EF\u5C06 Claude Code / Simple AI \u8DEF\u7531\u5230\u517C\u5BB9 Anthropic Messages\u3001OpenAI Chat Completions \u6216 OpenAI Responses \u534F\u8BAE\u7684\u7AEF\u70B9\u3002",
    searchPlaceholder: "\u641C\u7D22\u540D\u79F0\u3001\u6A21\u578B\u6216\u7AEF\u70B9\u2026",
    noMatchingProfiles: "\u6CA1\u6709\u5339\u914D\u7684 Profile",
    cascadeTitle: "\u5DF2\u81EA\u52A8\u540C\u6B65",
    cascadeHint: "\u6FC0\u6D3B\u7684\u6A21\u578B\u4F9B\u5E94\u5546\u51ED\u8BC1\u5DF2\u540C\u6B65\u5230 Agent \u539F\u751F\u914D\u7F6E\u6587\u4EF6\uFF08\u5982 ~/.claude/settings.json\uFF09\uFF0C\u65E0\u9700\u624B\u52A8\u4FEE\u6539\u3002",
    addTitle: "\u6DFB\u52A0\u6A21\u578B\u4F9B\u5E94\u5546",
    editTitle: "\u7F16\u8F91\u6A21\u578B\u4F9B\u5E94\u5546",
    cancel: "\u53D6\u6D88",
    created: "\u5DF2\u521B\u5EFA Profile",
    updated: "\u5DF2\u66F4\u65B0 Profile",
    quickInput: "\u5FEB\u901F\u8F93\u5165",
    quickInputPlaceholder: "\u7C98\u8D34\uFF1A[URL] [\u6A21\u578B\u540D] [API Key] \u2014 \u81EA\u52A8\u586B\u5145\u4E0B\u65B9\u8868\u5355",
    sectionBasic: "\u57FA\u7840\u4FE1\u606F",
    addModelOption: "\u6DFB\u52A0\u6A21\u578B",
    defaultModel: "\u9ED8\u8BA4\u6A21\u578B",
    setAsDefault: "\u8BBE\u4E3A\u9ED8\u8BA4",
    fetchedModelsHint: "\u5DF2\u62C9\u53D6 {{count}} \u4E2A\u6A21\u578B\uFF0C\u53EF\u5728\u4E0A\u65B9\u8F93\u5165\u6846\u9009\u62E9",
    sectionAuth: "\u8BA4\u8BC1\u914D\u7F6E",
    sectionProtocol: "\u534F\u8BAE\u4E0E\u9002\u7528\u8303\u56F4",
    sectionAdvanced: "\u9AD8\u7EA7\u9009\u9879",
    fetchModels: "\u62C9\u53D6\u6A21\u578B",
    fetchModelsSuccess: "\u6210\u529F\u62C9\u53D6 {{count}} \u4E2A\u6A21\u578B",
    fetchModelsEmpty: "\u7AEF\u70B9\u672A\u8FD4\u56DE\u4EFB\u4F55\u6A21\u578B",
    baseUrlRequired: "\u8BF7\u5148\u586B\u5199 API \u7AEF\u70B9 URL",
    apiKeyEnvName: "API Key \u73AF\u5883\u53D8\u91CF\u540D",
    customHeaders: "\u81EA\u5B9A\u4E49\u8BF7\u6C42\u5934",
    customEnv: "\u81EA\u5B9A\u4E49\u73AF\u5883\u53D8\u91CF",
    addHeader: "\u6DFB\u52A0\u8BF7\u6C42\u5934",
    addEnv: "\u6DFB\u52A0\u73AF\u5883\u53D8\u91CF",
    maxTokens: "\u5355\u6B21\u8F93\u51FA\u4E0A\u9650 (max_tokens)",
    maxTokensPlaceholder: "\u7559\u7A7A = \u4F9B\u5E94\u5546\u9ED8\u8BA4",
    contextWindow: "\u4E0A\u4E0B\u6587\u7A97\u53E3 (tokens)",
    contextWindowPlaceholder: "\u7559\u7A7A = 180,000",
    contextWindowPresets: {
      "180k": "180K",
      "256k": "256K",
      "1m": "1M"
    },
    filter: {
      all: "\u5168\u90E8",
      claude: "Claude",
      "simple-ai": "Simple AI"
    },
    authType: {
      label: "\u8BA4\u8BC1\u65B9\u5F0F",
      authToken: "Auth Token\uFF08ANTHROPIC_AUTH_TOKEN\uFF09",
      apiKey: "API Key\uFF08ANTHROPIC_API_KEY\uFF09",
      customEnv: "\u81EA\u5B9A\u4E49\u73AF\u5883\u53D8\u91CF",
      none: "\u65E0\u9700\u9274\u6743\uFF08\u672C\u5730\u6A21\u578B\uFF09",
      hint: {
        auth_token: "API Key \u6CE8\u5165\u4E3A ANTHROPIC_AUTH_TOKEN\uFF08Bearer\uFF09\uFF0C\u9002\u7528\u4E8E\u591A\u6570 Anthropic \u517C\u5BB9\u7AEF\u70B9",
        api_key: "API Key \u6CE8\u5165\u4E3A ANTHROPIC_API_KEY\uFF08x-api-key \u5934\uFF09",
        custom_env: "API Key \u6CE8\u5165\u4E3A\u4E0B\u65B9\u6307\u5B9A\u7684\u73AF\u5883\u53D8\u91CF\u540D\uFF0C\u9002\u7528\u4E8E OpenAI \u7B49\u9700\u8981\u7279\u5B9A\u53D8\u91CF\u540D\u7684\u7AEF\u70B9",
        none: "\u4E0D\u6CE8\u5165\u4EFB\u4F55\u9274\u6743\u4FE1\u606F\uFF0C\u9002\u7528\u4E8E\u672C\u5730\u65E0\u9274\u6743\u6A21\u578B"
      }
    },
    targetEngine: {
      label: "\u9002\u7528\u5F15\u64CE",
      claude: "Claude Code",
      "simple-ai": "Simple AI",
      selectAll: "\u5168\u9009",
      allEngines: "\u9002\u7528\u4E8E\u6240\u6709\u5F15\u64CE"
    },
    category: {
      label: "\u4F9B\u5E94\u5546\u5206\u7C7B",
      unspecified: "\u672A\u6307\u5B9A",
      official: "\u5B98\u65B9\u76F4\u8FDE",
      cn_official: "\u56FD\u5185\u5B98\u65B9",
      aggregator: "\u805A\u5408\u5E73\u53F0",
      third_party: "\u7B2C\u4E09\u65B9",
      custom: "\u81EA\u5B9A\u4E49"
    },
    wireApi: {
      label: "\u534F\u8BAE\u683C\u5F0F",
      anthropicMessages: "Anthropic Messages\uFF08\u9ED8\u8BA4\uFF09",
      openaiChatCompletions: "OpenAI Chat Completions",
      openaiResponses: "OpenAI Responses",
      openaiHint: "Polaris \u5185\u5D4C\u4EE3\u7406\u4F1A\u5C06 Claude CLI \u8BF7\u6C42\u8F6C\u6362\u4E3A OpenAI Chat Completions \u683C\u5F0F\u53D1\u9001\u7ED9\u6B64\u7AEF\u70B9",
      responsesHint: "Polaris \u5185\u5D4C\u4EE3\u7406\u4F1A\u5C06 Claude CLI \u8BF7\u6C42\u8F6C\u6362\u4E3A OpenAI Responses \u683C\u5F0F\uFF08GPT-5\u3001o \u7CFB\u5217\uFF09\u53D1\u9001\u7ED9\u6B64\u7AEF\u70B9"
    }
  },
  claudeCode: {
    title: "Claude Code \u914D\u7F6E",
    cliPath: "Claude CLI \u547D\u4EE4\u8DEF\u5F84",
    notAvailable: "\u672A\u5B89\u88C5"
  },
  language: {
    title: "\u8BED\u8A00\u8BBE\u7F6E",
    current: "\u5F53\u524D\u8BED\u8A00",
    hint: "\u5207\u6362\u754C\u9762\u663E\u793A\u8BED\u8A00"
  },
  appearance: {
    title: "\u5916\u89C2\u4E3B\u9898",
    current: "\u5F53\u524D\u4E3B\u9898",
    hint: "\u6DF1\u8272 / \u6D45\u8272\u4E3B\u9898\u5207\u6362\uFF08\u6D45\u8272\u4E3A\u5B9E\u9A8C\u6027\uFF09",
    dark: "\u6DF1\u8272",
    light: "\u6D45\u8272",
    experimental: "\u5B9E\u9A8C\u6027"
  },
  baiduTranslate: {
    title: "\u767E\u5EA6\u7FFB\u8BD1",
    hint: "\u914D\u7F6E\u767E\u5EA6\u7FFB\u8BD1 API \u540E\uFF0C\u53EF\u5728\u53D1\u9001\u6D88\u606F\u65F6\u4E00\u952E\u7FFB\u8BD1\u4E3A\u82F1\u8BED",
    appId: "App ID",
    appIdPlaceholder: "\u767E\u5EA6\u7FFB\u8BD1 App ID",
    secretKey: "\u5BC6\u94A5 (Secret Key)",
    secretKeyPlaceholder: "\u767E\u5EA6\u7FFB\u8BD1\u5BC6\u94A5",
    applyHint: "\u5728",
    platform: "\u767E\u5EA6\u7FFB\u8BD1\u5F00\u653E\u5E73\u53F0"
  },
  validation: {
    fileNotFound: "\u6587\u4EF6\u4E0D\u5B58\u5728",
    executionFailed: "\u6267\u884C\u5931\u8D25",
    validationError: "\u9A8C\u8BC1\u8FC7\u7A0B\u4E2D\u53D1\u751F\u9519\u8BEF",
    invalidPath: "\u8DEF\u5F84\u65E0\u6548"
  },
  advanced: {
    gitConfig: "Git \u914D\u7F6E",
    gitBinPath: "Git \u53EF\u6267\u884C\u6587\u4EF6\u8DEF\u5F84",
    gitBinPathPlaceholder: "\u7559\u7A7A\u4F7F\u7528\u7CFB\u7EDF\u9ED8\u8BA4 git",
    gitBinPathHint: "\u6307\u5B9A Git \u53EF\u6267\u884C\u6587\u4EF6\u7684\u5B8C\u6574\u8DEF\u5F84\uFF0C\u7559\u7A7A\u5219\u4F7F\u7528\u7CFB\u7EDF PATH \u4E2D\u7684 git",
    sessionConfig: "\u4F1A\u8BDD\u914D\u7F6E",
    sessionDir: "\u4F1A\u8BDD\u5B58\u50A8\u76EE\u5F55",
    sessionDirPlaceholder: "\u7559\u7A7A\u4F7F\u7528\u9ED8\u8BA4\u76EE\u5F55",
    sessionDirHint: "AI \u4F1A\u8BDD\u5386\u53F2\u7684\u5B58\u50A8\u4F4D\u7F6E\uFF0C\u7559\u7A7A\u5219\u4F7F\u7528\u7CFB\u7EDF\u9ED8\u8BA4\u76EE\u5F55",
    debugInfo: "\u8C03\u8BD5\u4FE1\u606F",
    configFile: "\u914D\u7F6E\u6587\u4EF6",
    logDir: "\u65E5\u5FD7\u76EE\u5F55",
    currentEngine: "\u5F53\u524D\u5F15\u64CE"
  },
  qqbot: {
    title: "QQ Bot \u96C6\u6210",
    description: "\u901A\u8FC7 QQ \u673A\u5668\u4EBA\u63A5\u6536\u548C\u53D1\u9001\u6D88\u606F",
    enable: "\u542F\u7528 QQ Bot \u96C6\u6210",
    instances: "\u673A\u5668\u4EBA\u5B9E\u4F8B",
    addInstance: "\u6DFB\u52A0\u5B9E\u4F8B",
    noInstances: "\u6682\u65E0\u5B9E\u4F8B\uFF0C\u70B9\u51FB\u4E0A\u65B9\u6DFB\u52A0",
    instanceConfig: "\u5B9E\u4F8B\u914D\u7F6E",
    instanceName: "\u5B9E\u4F8B\u540D\u79F0",
    instanceNamePlaceholder: "\u4F8B\u5982\uFF1A\u751F\u4EA7\u673A\u5668\u4EBA",
    appId: "App ID",
    appIdPlaceholder: "QQ \u5F00\u653E\u5E73\u53F0\u5E94\u7528\u7684 App ID",
    clientSecret: "Client Secret",
    clientSecretPlaceholder: "QQ \u5F00\u653E\u5E73\u53F0\u5E94\u7528\u7684 Client Secret",
    sandbox: "\u6C99\u7BB1\u73AF\u5883",
    autoConnect: "\u81EA\u52A8\u8FDE\u63A5",
    displayMode: "\u663E\u793A\u6A21\u5F0F",
    displayModeChat: "\u804A\u5929\u6A21\u5F0F",
    displayModeSeparate: "\u5206\u79BB\u6A21\u5F0F",
    displayModeBoth: "\u4E24\u8005\u90FD\u6709",
    unsaved: "\u672A\u4FDD\u5B58",
    connected: "\u5DF2\u8FDE\u63A5",
    save: "\u4FDD\u5B58",
    saving: "\u4FDD\u5B58\u4E2D...",
    connect: "\u8FDE\u63A5",
    connecting: "\u8FDE\u63A5\u4E2D...",
    disconnect: "\u65AD\u5F00",
    switch: "\u5207\u6362",
    delete: "\u5220\u9664",
    deleteConfirm: "\u786E\u5B9A\u8981\u5220\u9664\u6B64\u5B9E\u4F8B\u5417\uFF1F",
    switchConfirm: "\u6709\u672A\u4FDD\u5B58\u7684\u66F4\u6539\uFF0C\u786E\u5B9A\u8981\u5207\u6362\u5417\uFF1F",
    connectionState: {
      disconnected: "\u672A\u8FDE\u63A5",
      connecting: "\u8FDE\u63A5\u4E2D...",
      authenticating: "\u9274\u6743\u4E2D...",
      ready: "\u5DF2\u5C31\u7EEA",
      failed: "\u8FDE\u63A5\u5931\u8D25",
      reconnecting: "\u91CD\u8FDE\u4E2D..."
    },
    error: {
      title: "\u8FDE\u63A5\u5931\u8D25",
      getTokenFailed: "\u83B7\u53D6 Access Token \u5931\u8D25",
      getGatewayFailed: "\u83B7\u53D6 Gateway URL \u5931\u8D25",
      connectTimeout: "\u8FDE\u63A5\u8D85\u65F6",
      authFailed: "\u9274\u6743\u5931\u8D25",
      websocketError: "WebSocket \u9519\u8BEF",
      connectionClosed: "\u8FDE\u63A5\u88AB\u5173\u95ED"
    },
    hints: {
      title: "\u4F7F\u7528\u8BF4\u660E",
      saveFirst: "\u586B\u5199\u914D\u7F6E\u540E\u70B9\u51FB\u300C\u4FDD\u5B58\u300D\u4FDD\u5B58\u5B9E\u4F8B",
      connectWillSave: "\u70B9\u51FB\u300C\u8FDE\u63A5\u300D\u4F1A\u81EA\u52A8\u4FDD\u5B58\u5E76\u8FDE\u63A5",
      singleInstance: "\u540C\u4E00\u65F6\u95F4\u53EA\u80FD\u8FDE\u63A5\u4E00\u4E2A QQ Bot \u5B9E\u4F8B",
      sandboxForTest: "\u6C99\u7BB1\u73AF\u5883\u7528\u4E8E\u6D4B\u8BD5\uFF0C\u751F\u4EA7\u73AF\u5883\u9700\u5BA1\u6838"
    },
    status: {
      current: "\u5F53\u524D",
      notConfigured: "\u672A\u914D\u7F6E",
      activated: "\u5DF2\u6FC0\u6D3B"
    }
  },
  systemPrompt: {
    enable: "\u542F\u7528\u81EA\u5B9A\u4E49\u7CFB\u7EDF\u63D0\u793A\u8BCD",
    enableDesc: "\u542F\u7528\u540E\u53EF\u81EA\u5B9A\u4E49\u53D1\u9001\u7ED9 AI \u7684\u7CFB\u7EDF\u63D0\u793A\u8BCD",
    customPrompt: "\u81EA\u5B9A\u4E49\u63D0\u793A\u8BCD",
    placeholder: "\u8F93\u5165\u81EA\u5B9A\u4E49\u7CFB\u7EDF\u63D0\u793A\u8BCD...\n\n\u53EF\u7528\u53D8\u91CF:\n{{workspaceName}} - \u5F53\u524D\u5DE5\u4F5C\u533A\u540D\u79F0\n{{workspacePath}} - \u5F53\u524D\u5DE5\u4F5C\u533A\u8DEF\u5F84\n{{contextWorkspaces}} - \u5173\u8054\u5DE5\u4F5C\u533A\u5217\u8868\n{{date}} - \u5F53\u524D\u65E5\u671F\n{{time}} - \u5F53\u524D\u65F6\u95F4\n{{defaultPrompt}} - \u9ED8\u8BA4\u7CFB\u7EDF\u63D0\u793A\u8BCD",
    charCount: "{{count}} \u5B57\u7B26",
    reset: "\u91CD\u7F6E\u4E3A\u9ED8\u8BA4",
    resetConfirm: "\u786E\u5B9A\u8981\u91CD\u7F6E\u4E3A\u9ED8\u8BA4\u8BBE\u7F6E\u5417\uFF1F",
    fillDefault: "\u586B\u5165\u9ED8\u8BA4",
    showVariables: "\u663E\u793A\u53D8\u91CF",
    hideVariables: "\u9690\u85CF\u53D8\u91CF",
    variablesHint: "\u70B9\u51FB\u53D8\u91CF\u53EF\u63D2\u5165\u5230\u4E0B\u65B9\u7F16\u8F91\u5668\uFF1A",
    variables: {
      workspaceName: "\u5F53\u524D\u5DE5\u4F5C\u533A\u540D\u79F0",
      workspacePath: "\u5F53\u524D\u5DE5\u4F5C\u533A\u8DEF\u5F84",
      contextWorkspaces: "\u5173\u8054\u5DE5\u4F5C\u533A\u5217\u8868",
      date: "\u5F53\u524D\u65E5\u671F",
      time: "\u5F53\u524D\u65F6\u95F4",
      defaultPrompt: "\u9ED8\u8BA4\u7CFB\u7EDF\u63D0\u793A\u8BCD"
    },
    preview: "\u9884\u89C8",
    previewDefault: "\uFF08\u4F7F\u7528\u9ED8\u8BA4\u63D0\u793A\u8BCD\uFF09",
    previewDefaultLabel: "[\u9ED8\u8BA4\u63D0\u793A\u8BCD]",
    previewNote: "\u6B64\u5185\u5BB9\u4F1A\u4F5C\u4E3A\u7CFB\u7EDF\u63D0\u793A\u8BCD\u53D1\u9001\uFF0C\u5DE5\u4F5C\u533A\u4FE1\u606F\u4F1A\u81EA\u52A8\u8FFD\u52A0"
  },
  web: {
    enableTitle: "\u542F\u7528 Web \u670D\u52A1",
    enableDesc: "\u5141\u8BB8\u901A\u8FC7\u6D4F\u89C8\u5668\u5728\u5C40\u57DF\u7F51\u5185\u8BBF\u95EE Polaris",
    portConfig: "\u7AEF\u53E3\u914D\u7F6E",
    host: "\u76D1\u542C\u5730\u5740",
    hostHint: "0.0.0.0 \u76D1\u542C\u6240\u6709\u7F51\u5361\uFF0C127.0.0.1 \u4EC5\u672C\u673A\u8BBF\u95EE",
    port: "\u76D1\u542C\u7AEF\u53E3",
    portHint: "\u5EFA\u8BAE\u4F7F\u7528 1024-65535 \u8303\u56F4\u5185\u7684\u7AEF\u53E3",
    applyTitle: "\u5E94\u7528\u914D\u7F6E",
    applyDesc: "\u4FDD\u5B58\u540E\u70B9\u51FB\u300C\u5E94\u7528\u300D\u5373\u65F6\u751F\u6548\uFF0C\u65E0\u9700\u91CD\u542F\u5E94\u7528",
    applyButton: "\u5E94\u7528",
    applyFailed: "\u5E94\u7528\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",
    serverStarted: "Web \u670D\u52A1\u5DF2\u542F\u52A8",
    serverStopped: "Web \u670D\u52A1\u5DF2\u505C\u6B62",
    accessInfo: "\u8BBF\u95EE\u4FE1\u606F",
    accessUrl: "\u8BBF\u95EE\u5730\u5740",
    otherAccessUrl: "\u5176\u4ED6\u8BBF\u95EE\u5730\u5740",
    selectAddress: "\u9009\u62E9\u5730\u5740",
    accessHint: "\u4F7F\u7528\u8BF4\u660E",
    accessHintDesc: "\u4FDD\u5B58 Web \u8BBE\u7F6E\u540E\u5373\u65F6\u751F\u6548\u3002\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00\u8BBF\u95EE\u5730\u5740\u5373\u53EF\u76F4\u63A5\u4F7F\u7528\u3002",
    openInBrowser: "\u4ECE\u6D4F\u89C8\u5668\u6253\u5F00",
    actualPort: "\u5B9E\u9645\u7AEF\u53E3",
    actualPortHint: "\u9996\u9009\u7AEF\u53E3\u88AB\u5360\u7528\uFF0C\u5F53\u524D\u6B63\u5728\u4F7F\u7528 {{port}}",
    qrTitle: "\u626B\u7801\u8BBF\u95EE",
    qrHint: "\u4F7F\u7528\u624B\u673A\u626B\u63CF\u4E8C\u7EF4\u7801\uFF0C\u5373\u53EF\u76F4\u63A5\u8BBF\u95EE Polaris Web \u754C\u9762",
    qrNoIp: "\u672A\u68C0\u6D4B\u5230\u5C40\u57DF\u7F51 IP\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5",
    qrDisabled: "\u542F\u7528 Web \u670D\u52A1\u540E\u663E\u793A\u4E8C\u7EF4\u7801",
    connectionLost: "Web \u670D\u52A1\u8FDE\u63A5\u5DF2\u65AD\u5F00",
    connectionLostDesc: "\u5B9E\u65F6\u66F4\u65B0\u4E0D\u53EF\u7528\uFF0C\u8BF7\u68C0\u67E5\u684C\u9762\u7AEF\u662F\u5426\u6B63\u5728\u8FD0\u884C",
    connectionRestored: "\u8FDE\u63A5\u5DF2\u6062\u590D",
    token: "\u8BBF\u95EE Token",
    tokenPlaceholder: "\u7559\u7A7A\u8868\u793A\u4E0D\u542F\u7528\u9274\u6743",
    tokenHint: "\u7559\u7A7A\u4E0D\u68C0\u67E5\uFF1B\u586B\u5199\u540E\uFF0CWeb \u7AEF\u6BCF\u4E2A\u63A5\u53E3\u8BF7\u6C42\u90FD\u4F1A\u643A\u5E26\u6B64 Token\uFF08\u524D\u7AEF\u4F1A\u505A MD5 \u540E\u518D\u53D1\u9001\uFF09"
  },
  appUpdate: {
    title: "\u5E94\u7528\u66F4\u65B0",
    description: "\u4ECE GitHub Releases \u68C0\u67E5 MSI \u66F4\u65B0\uFF0C\u5E76\u67E5\u770B\u5386\u53F2\u7248\u672C\u3002",
    desktopAvailable: "\u684C\u9762\u7AEF\u53EF\u7528",
    desktopOnly: "\u4EC5\u684C\u9762\u7AEF",
    currentVersion: "\u5F53\u524D\u7248\u672C",
    latestRelease: "\u6700\u65B0\u53D1\u5E03",
    source: "\u66F4\u65B0\u6E90",
    check: "\u68C0\u67E5\u66F4\u65B0",
    installAndRestart: "\u5B89\u88C5\u5E76\u91CD\u542F",
    checkAndInstall: "\u68C0\u67E5\u5E76\u66F4\u65B0",
    autoUpdateNote: "\u89E6\u53D1\u540E\u81EA\u52A8\u5B8C\u6210\u4E0B\u8F7D\u3001\u5B89\u88C5\u5E76\u91CD\u542F\uFF0C\u5168\u7A0B\u65E0\u9700\u518D\u6B21\u786E\u8BA4\uFF1B\u8BF7\u5728\u89E6\u53D1\u524D\u4FDD\u5B58\u8FDB\u884C\u4E2D\u7684\u5DE5\u4F5C\u3002",
    updateDone: "\u66F4\u65B0\u5B8C\u6210",
    updateDoneDesc: "\u65B0\u7248\u672C\u5DF2\u5B89\u88C5\u5E76\u91CD\u542F\u3002",
    localManifestPath: "\u672C\u5730\u5305\u8DEF\u5F84",
    customManifestUrl: "Manifest URL",
    githubRepo: "GitHub \u4ED3\u5E93",
    updateAvailable: "\u53D1\u73B0\u65B0\u7248\u672C",
    updateAvailableDesc: "\u7248\u672C {{version}} \u5DF2\u53EF\u5B89\u88C5\u3002",
    upToDate: "\u5DF2\u662F\u6700\u65B0\u7248\u672C",
    upToDateDesc: "\u5F53\u524D\u5DF2\u7ECF\u662F\u6700\u65B0\u7248\u672C\u3002",
    checkFailed: "\u68C0\u67E5\u66F4\u65B0\u5931\u8D25",
    installFailed: "\u5B89\u88C5\u66F4\u65B0\u5931\u8D25",
    availableVersion: "\u53EF\u7528\u7248\u672C\uFF1A{{version}}",
    downloading: "\u6B63\u5728\u4E0B\u8F7D\u66F4\u65B0",
    historyTitle: "\u5386\u53F2\u7248\u672C",
    historyDesc: "\u67E5\u770B\u5DF2\u53D1\u5E03\u7684 GitHub Releases\uFF0C\u5E76\u4E0B\u8F7D MSI \u5B89\u88C5\u5305\u3002",
    refreshReleases: "\u5237\u65B0\u7248\u672C\u5217\u8868",
    noReleases: "\u6682\u65E0\u53D1\u5E03\u7248\u672C",
    current: "\u5F53\u524D",
    prerelease: "\u9884\u53D1\u5E03",
    download: "\u4E0B\u8F7D",
    downloadMsi: "\u4E0B\u8F7D MSI",
    openRelease: "\u6253\u5F00\u53D1\u5E03\u9875",
    rollbackWarning: "\u56DE\u9000\u4F1A\u5B89\u88C5\u66F4\u65E7\u7684 MSI\uFF0C\u53EF\u80FD\u9700\u8981\u5148\u5378\u8F7D\u5F53\u524D\u7248\u672C\u3002\u964D\u7EA7\u524D\u8BF7\u5907\u4EFD\u7528\u6237\u914D\u7F6E\u3002"
  },
  focus: {
    title: "\u9605\u8BFB\u805A\u7126\u6A21\u5F0F",
    hint: "\u51CF\u5C11\u89C6\u89C9\u5E72\u6270\uFF0C\u4E13\u6CE8\u5F53\u524D\u5185\u5BB9\u3002\u5FEB\u6377\u952E Alt+F / Alt+Shift+F",
    off: "\u5173\u95ED",
    offDesc: "\u4E0D\u542F\u7528\u805A\u7126",
    l1: "\u8BED\u4E49\u805A\u7126",
    l1Desc: "\u60AC\u505C\u6D88\u606F\u5757\u9AD8\u4EAE\uFF0C\u5176\u4F59\u964D\u4EAE\u5EA6",
    l2: "\u805A\u5149\u706F",
    l2Desc: "\u53E0\u52A0\u5168\u5C4F\u906E\u7F69\uFF0C\u9F20\u6807\u5904\u6E05\u6670",
    desktopOnly: "\u4EC5\u684C\u9762\u7AEF\u53EF\u7528\uFF1A\u89E6\u5C4F\u8BBE\u5907\u65E0\u9F20\u6807\u60AC\u505C\u8BED\u4E49\u3002",
    dimOpacity: "\u5144\u5F1F\u964D\u4EAE\u5EA6",
    spotRadius: "\u805A\u5149\u706F\u534A\u5F84",
    spotBlur: "\u5706\u5916\u6A21\u7CCA\u5F3A\u5EA6",
    noBlur: "\u4E0D\u6A21\u7CCA",
    spotBlurHint: "\u4F4E\u7AEF\u673A\u6389\u5E27\u65F6\u8BBE\u4E3A 0\uFF08\u4EC5\u964D\u4EAE\u5EA6\u4E0D\u6A21\u7CCA\uFF09"
  },
  uiControl: {
    title: "AI \u754C\u9762\u63A7\u5236",
    description: "\u5141\u8BB8 AI \u8C03\u6574\u4E3B\u9898\u914D\u8272\u4E0E\u5BF9\u8BDD\u6E32\u67D3\u914D\u7F6E\uFF08\u5B57\u53F7\u3001\u6D88\u606F\u95F4\u8DDD\u7B49\uFF09\uFF0C\u4E09\u7AEF\u540C\u6E90\u751F\u6548",
    hint: "\u5173\u95ED\u65F6\u9690\u85CF bus \u4E2D\u7684 cap.ui.* \u5DE5\u5177\uFF1B\u5F00\u542F\u540E AI \u5373\u53EF\u7ECF\u5DE5\u5177\u8C03\u7528\u63A7\u5236\u754C\u9762\u6837\u5F0F"
  },
  autolaunch: {
    title: "\u5F00\u673A\u81EA\u52A8\u542F\u52A8",
    description: "\u767B\u5F55\u7CFB\u7EDF\u540E\u81EA\u52A8\u542F\u52A8 Polaris\uFF08\u6700\u5C0F\u5316\u542F\u52A8\uFF0C\u4E0D\u62A2\u7126\u70B9\uFF09",
    hint: "\u4FDD\u5B58\u540E\u751F\u6548\uFF1B\u5347\u7EA7/\u632A\u76EE\u5F55\u5BFC\u81F4\u7684\u8DEF\u5F84\u6F02\u79FB\u4F1A\u5728\u4E0B\u6B21\u542F\u52A8\u65F6\u81EA\u52A8\u7EA0\u6B63"
  },
  mobileConnection: {
    title: "\u79FB\u52A8\u7AEF\u8FDE\u63A5\u7BA1\u7406",
    connected: "\u5DF2\u8FDE\u63A5",
    disconnected: "\u672A\u8FDE\u63A5",
    hint: "\u7BA1\u7406\u79FB\u52A8\u7AEF\u4E0E\u684C\u9762\u7AEF\u7684\u8FDE\u63A5\uFF0C\u53EF\u67E5\u770B\u72B6\u6001\u6216\u65AD\u5F00\u8FDE\u63A5",
    manage: "\u7BA1\u7406\u8FDE\u63A5"
  },
  performance: {
    migrationBanner: {
      title: "\u6027\u80FD\u4F18\u5316\u66F4\u65B0",
      goSettings: "\u67E5\u770B\u5F00\u5173",
      dismiss: "\u77E5\u9053\u4E86"
    },
    overview: "\u5F53\u524D\u5DF2\u5F00\u542F {{active}}/{{total}} \u4E2A\u529F\u80FD",
    allOff: "\u5168\u90E8\u5173\u95ED \xB7 \u6700\u8F7B\u91CF",
    tips: "\u9ED8\u8BA4\u5168\u90E8\u5173\u95ED\u4EE5\u8282\u7701\u8D44\u6E90\uFF0C\u6309\u9700\u5F00\u542F\u3002\u914D\u7F6E\u53D8\u66F4\u5373\u65F6\u751F\u6548\uFF0C\u65E0\u9700\u91CD\u542F\u5E94\u7528\u3002",
    switchOff: "\u5173\u95ED {{name}}",
    switchOn: "\u5F00\u542F {{name}}",
    notes: "\u6CE8\u610F\u4E8B\u9879",
    note2: "\u63D2\u4EF6\u670D\u52A1\u81EA\u52A8\u542F\u52A8\u5173\u95ED\u540E\uFF0C\u9996\u6B21\u4F7F\u7528\u63D2\u4EF6\u529F\u80FD\u65F6\u4F1A\u6709\u77ED\u6682\u7B49\u5F85\uFF082-3 \u79D2\uFF09",
    note3: "\u5982\u679C\u4E0D\u786E\u5B9A\uFF0C\u4FDD\u6301\u9ED8\u8BA4\u5173\u95ED\u5373\u53EF\u83B7\u5F97\u6700\u4F73\u6027\u80FD"
  },
  common: {
    loading: "",
    saving: "",
    save: ""
  },
  textarea: "",
  theme: {
    guideTitle: "\u4E3B\u9898\u751F\u6210\u6307\u5357"
  }
};

// locales/en-US.json
var en_US_default = {
  title: "Settings",
  search: "Search settings...",
  aiEngine: {
    title: "AI Engine",
    authStatus: "Auth Status",
    loggedIn: "Logged In",
    notLoggedIn: "Not Logged In",
    checkingAuth: "Checking...",
    authUnknown: "Unknown",
    openInstallPage: "",
    builtinHint: "",
    installing: "",
    updateAction: "",
    installAction: "",
    uninstalling: "",
    uninstallAction: "",
    installPreparing: "",
    installHint: ""
  },
  currentGroup: "Current group: {{name}}",
  saveTab: "Save {{name}}",
  nav: {
    general: "General",
    theme: "Theme",
    systemPrompt: "System Prompt",
    promptSnippet: "Prompt Snippets",
    aiEngine: "AI Engine",
    modelProvider: "Model Providers",
    translate: "Translate",
    scheduler: "Scheduler",
    advanced: "Advanced",
    plugins: "Plugins",
    appUpdate: "App Update",
    mcp: "MCP Servers",
    web: "Web Service",
    personalHub: "Personal Hub",
    tokenStats: "Token Stats",
    performance: "Performance & Resources",
    routeLog: "Route Log",
    providerStats: "Provider Stats"
  },
  tokenStats: {
    empty: "No token statistics yet",
    emptyHint: "After sending a message, the proxy automatically records API usage",
    totalRequests: "Requests",
    totalInput: "Input Tokens",
    totalOutput: "Output Tokens",
    totalCache: "Cache",
    cacheHitRate: "Cache hit",
    cacheHitRateShort: "Hit rate",
    cacheHitRateHint: "Cache hit rate = cache read / (input + cache read), cost-based",
    totalCost: "Total Cost",
    overview: "Overview",
    model: "By Model",
    time: "By Time",
    topSessions: "Top Requests",
    topModels: "Top 5 Models",
    noModelData: "No model-level data",
    engineDistribution: "Engine Distribution",
    noEngineData: "No engine data",
    requests: "Requests",
    input: "Input",
    output: "Output",
    cache: "Cache",
    cost: "Cost",
    engine: "Engine",
    noTimeData: "No data in this time range",
    noSessions: "No request data",
    pageInfo: "Page {{page}}",
    prev: "Previous",
    next: "Next",
    allModels: "All models",
    refresh: "Refresh",
    preset: {
      today: "Today",
      yesterday: "Yesterday",
      dayBefore: "Day before",
      rolling7: "Last 7 days",
      rolling30: "Last 30 days",
      lastWeek: "Last week",
      lastMonth: "Last month",
      all: "All"
    },
    presetGroup: {
      day: "Day",
      rolling: "Range",
      period: "Period",
      all: "All"
    },
    timeRange: {
      placeholder: "Select time range",
      clear: "Clear",
      pickStart: "Click start date, then end date",
      pickEnd: "Start {{date}} selected, click end date",
      weekdays: [
        "M",
        "T",
        "W",
        "T",
        "F",
        "S",
        "S"
      ]
    }
  },
  messages: {
    saved: "Saved",
    configSavedDesc: "Configuration saved successfully",
    saveFailed: "Save failed"
  },
  plugins: {
    description: "Manage Polaris built-in and discovered plugin UI entries and MCP capabilities. Changes are saved locally immediately.",
    discoverySummary: "{{count}} installed plugins discovered, {{issues}} diagnostics",
    discoveryError: "Plugin discovery failed: {{error}}",
    refreshDiscovery: "Refresh installed plugins",
    refreshingDiscovery: "Refreshing...",
    discoveryIssuesTitle: "Manifest diagnostics",
    builtin: "Built-in",
    userInstalled: "User installed",
    projectInstalled: "Project plugin",
    enablePlugin: "Enable plugin",
    enabled: "Enabled",
    disabled: "Disabled",
    coreLocked: "The core plugin owns base panel entries and cannot be disabled in this version.",
    uiSurface: "Visual module",
    mcpSurface: "MCP services",
    viewCount: "{{count}} entries",
    mcpCount: "{{count}} services",
    mcpRuntimePlan: "MCP runtime plan",
    mcpRuntimeSummary: "{{enabled}} enabled, {{disabled}} disabled",
    enableAllMcp: "Enable all",
    permissionsTitle: "Permissions",
    noPermissions: "No extra permissions",
    reset: "Reset",
    checkUpdate: "Check update",
    checkingUpdate: "Checking...",
    updateAvailable: "Update available: {{current}} -> {{latest}}",
    noUpdateAvailable: "No update found. Current version: {{version}}",
    updateUnavailable: "Update check unavailable",
    origin: {
      repository: "Repository",
      homepage: "Homepage",
      updateUrl: "Update source"
    },
    permissions: {
      workspaceRead: "Read workspace",
      workspaceWrite: "Write workspace",
      appConfigRead: "Read app config",
      appConfigWrite: "Write app config",
      network: "Network access",
      aiToolAccess: "AI tool access"
    },
    marketplaceBannerTitle: "Polaris Marketplace",
    marketplaceBannerDesc: "Browse, search and one-click install community plugins. Manage and update installed plugins.",
    marketplaceInstall: "Install",
    marketplaceInstalling: "Installing...",
    marketplaceInstallSucceeded: "Marketplace installed",
    selectPluginDirectory: "",
    installFailed: "",
    installSucceeded: "",
    selectPluginPackage: "",
    uninstallConfirm: "",
    uninstallingDev: "",
    uninstalling: "",
    uninstallFailed: "",
    uninstallSucceeded: "",
    selectDevPluginDirectory: "",
    devLinkFailed: "",
    devLinkSucceeded: "",
    forceUninstallConfirm: "",
    forceUninstalling: "",
    forceUninstallSucceeded: "",
    applyUpdateConfirm: "",
    updateApplyFailed: "",
    updateApplySucceeded: "",
    mcpHealthError: "",
    installDirectoryTitle: "",
    projectInstallUnavailable: "",
    installLocationsUnavailable: "",
    userInstallScope: "",
    projectInstallScope: "",
    openInstallDirectory: "",
    installFromDirectory: "",
    installFromPackage: "",
    devLinkHint: "",
    devLink: "",
    remoteSourcePlaceholder: "",
    installRemote: "",
    guideTitle: "",
    deprecated: "",
    devBadgeHint: "",
    devBadge: "",
    engineCount: "",
    devSourceLabel: "",
    deprecatedHint: "",
    noViews: "",
    noMcpServers: "",
    aiToolsSurface: "",
    refreshAiTools: "",
    aiToolsInjected: "",
    aiToolsLazy: "",
    aiToolsUnknown: "",
    noAiTools: "",
    engineSurface: "",
    noEngines: "",
    capabilitiesTitle: "",
    capOverride: "",
    uninstall: "",
    forceUninstall: "",
    uninstallDev: "",
    devSkipUpdate: "",
    applyingUpdate: "",
    applyUpdate: ""
  },
  engines: {
    claudeCode: {
      name: "Claude Code",
      description: "Official Anthropic CLI tool"
    },
    simpleAi: {
      name: "Simple AI",
      description: "Lightweight AI assistant \u2014 uses model provider config, built-in bash/file tools, no CLI required"
    }
  },
  modelProfile: {
    title: "Model Profiles",
    add: "Add",
    edit: "Edit",
    save: "Save",
    delete: "Delete",
    duplicate: "Duplicate",
    profileName: "Profile Name",
    baseUrl: "API Endpoint URL (e.g. https://api.siliconflow.cn)",
    apiKey: "API Key",
    showApiKey: "Show plaintext",
    hideApiKey: "Hide plaintext",
    modelName: "Model Name (e.g. glm-4)",
    description: "Description (optional)",
    noProfiles: "No model profiles yet. Click add to configure a third-party model endpoint",
    fromPreset: "Import from Preset",
    presetHint: "Choose a common provider to auto-fill the form, then enter your API Key",
    testConnection: "Test Connection",
    testSuccessTitle: "Connection Successful",
    testSuccessDesc: 'Endpoint "{{name}}" is reachable',
    testFailedTitle: "Connection Failed",
    testErrorTitle: "Test Error",
    testNetworkError: "Cannot reach the endpoint. Check your network or Base URL",
    testAuthFailed: "Authentication failed (HTTP {{status}}). Check your API Key",
    testNotFound: "Endpoint not found (HTTP {{status}}). Check the Base URL and path",
    testServerError: "Endpoint server error (HTTP {{status}}). Try again later",
    testBadStatus: "Endpoint returned an unexpected status (HTTP {{status}})",
    tabDescription: "Manage third-party model provider endpoints. Route Claude Code / Simple AI to endpoints compatible with the Anthropic Messages, OpenAI Chat Completions, or OpenAI Responses protocol.",
    searchPlaceholder: "Search by name, model, or endpoint\u2026",
    noMatchingProfiles: "No matching profiles",
    cascadeTitle: "Auto-synced",
    cascadeHint: "Active model provider credentials have been synced to agent native config files (e.g., ~/.claude/settings.json). No manual editing needed.",
    addTitle: "Add Model Provider",
    editTitle: "Edit Model Provider",
    cancel: "Cancel",
    created: "Profile created",
    updated: "Profile updated",
    quickInput: "Quick Input",
    quickInputPlaceholder: "Paste: [URL] [model name] [API key] \u2014 auto-fills below",
    sectionBasic: "Basic Info",
    addModelOption: "Add Model",
    defaultModel: "Default model",
    setAsDefault: "Set as default",
    fetchedModelsHint: "Fetched {{count}} models \u2014 pick one from the input above",
    sectionAuth: "Authentication",
    sectionProtocol: "Protocol & Scope",
    sectionAdvanced: "Advanced",
    fetchModels: "Fetch Models",
    fetchModelsSuccess: "Fetched {{count}} models",
    fetchModelsEmpty: "Endpoint returned no models",
    baseUrlRequired: "Please enter the API endpoint URL first",
    apiKeyEnvName: "API Key Environment Variable",
    customHeaders: "Custom Headers",
    customEnv: "Custom Environment Variables",
    addHeader: "Add Header",
    addEnv: "Add Variable",
    maxTokens: "Max Output Tokens (max_tokens)",
    maxTokensPlaceholder: "Empty = provider default",
    contextWindow: "Context Window (tokens)",
    contextWindowPlaceholder: "Empty = 180,000",
    contextWindowPresets: {
      "180k": "180K",
      "256k": "256K",
      "1m": "1M"
    },
    filter: {
      all: "All",
      claude: "Claude",
      "simple-ai": "Simple AI"
    },
    authType: {
      label: "Authentication",
      authToken: "Auth Token (ANTHROPIC_AUTH_TOKEN)",
      apiKey: "API Key (ANTHROPIC_API_KEY)",
      customEnv: "Custom Environment Variable",
      none: "No Auth (local model)",
      hint: {
        auth_token: "API Key is injected as ANTHROPIC_AUTH_TOKEN (Bearer), suitable for most Anthropic-compatible endpoints",
        api_key: "API Key is injected as ANTHROPIC_API_KEY (x-api-key header)",
        custom_env: "API Key is injected as the environment variable named below, for endpoints like OpenAI that require a specific variable name",
        none: "No authentication is injected, suitable for local models without auth"
      }
    },
    targetEngine: {
      label: "Target Engine",
      claude: "Claude Code",
      "simple-ai": "Simple AI",
      selectAll: "Select All",
      allEngines: "Applies to all engines"
    },
    category: {
      label: "Provider Category",
      unspecified: "Unspecified",
      official: "Official",
      cn_official: "CN Official",
      aggregator: "Aggregator",
      third_party: "Third Party",
      custom: "Custom"
    },
    wireApi: {
      label: "Wire Protocol",
      anthropicMessages: "Anthropic Messages (default)",
      openaiChatCompletions: "OpenAI Chat Completions",
      openaiResponses: "OpenAI Responses",
      openaiHint: "Polaris embedded proxy will convert Claude CLI requests to OpenAI Chat Completions format for this endpoint",
      responsesHint: "Polaris embedded proxy will convert Claude CLI requests to OpenAI Responses format (GPT-5, o-series) for this endpoint"
    }
  },
  claudeCode: {
    title: "Claude Code Configuration",
    cliPath: "Claude CLI Path",
    notAvailable: "Not Installed"
  },
  language: {
    title: "Language Settings",
    current: "Current Language",
    hint: "Switch interface display language"
  },
  appearance: {
    title: "Appearance",
    current: "Current Theme",
    hint: "Switch between dark and light theme (light is experimental)",
    dark: "Dark",
    light: "Light",
    experimental: "Experimental"
  },
  baiduTranslate: {
    title: "Baidu Translate",
    hint: "Configure Baidu Translate API to translate messages to English with one click",
    appId: "App ID",
    appIdPlaceholder: "Baidu Translate App ID",
    secretKey: "Secret Key",
    secretKeyPlaceholder: "Baidu Translate Secret Key",
    applyHint: "Apply at",
    platform: "Baidu Translate Platform"
  },
  validation: {
    fileNotFound: "File not found",
    executionFailed: "Execution failed",
    validationError: "Error during validation",
    invalidPath: "Invalid path"
  },
  advanced: {
    gitConfig: "Git Configuration",
    gitBinPath: "Git Executable Path",
    gitBinPathPlaceholder: "Leave empty to use system default git",
    gitBinPathHint: "Specify the full path to Git executable. Leave empty to use git from system PATH",
    sessionConfig: "Session Configuration",
    sessionDir: "Session Storage Directory",
    sessionDirPlaceholder: "Leave empty to use default directory",
    sessionDirHint: "Storage location for AI conversation history. Leave empty to use system default directory",
    debugInfo: "Debug Information",
    configFile: "Config File",
    logDir: "Log Directory",
    currentEngine: "Current Engine"
  },
  qqbot: {
    title: "QQ Bot Integration",
    description: "Send and receive messages via QQ Bot",
    enable: "Enable QQ Bot Integration",
    instances: "Bot Instances",
    addInstance: "Add Instance",
    noInstances: "No instances yet, click above to add",
    instanceConfig: "Instance Configuration",
    instanceName: "Instance Name",
    instanceNamePlaceholder: "e.g., Production Bot",
    appId: "App ID",
    appIdPlaceholder: "App ID from QQ Open Platform",
    clientSecret: "Client Secret",
    clientSecretPlaceholder: "Client Secret from QQ Open Platform",
    sandbox: "Sandbox Environment",
    autoConnect: "Auto Connect",
    displayMode: "Display Mode",
    displayModeChat: "Chat Mode",
    displayModeSeparate: "Separate Mode",
    displayModeBoth: "Both",
    unsaved: "Unsaved",
    connected: "Connected",
    save: "Save",
    saving: "Saving...",
    connect: "Connect",
    connecting: "Connecting...",
    disconnect: "Disconnect",
    switch: "Switch",
    delete: "Delete",
    deleteConfirm: "Are you sure you want to delete this instance?",
    switchConfirm: "You have unsaved changes. Are you sure you want to switch?",
    connectionState: {
      disconnected: "Disconnected",
      connecting: "Connecting...",
      authenticating: "Authenticating...",
      ready: "Ready",
      failed: "Failed",
      reconnecting: "Reconnecting..."
    },
    error: {
      title: "Connection Failed",
      getTokenFailed: "Failed to get Access Token",
      getGatewayFailed: "Failed to get Gateway URL",
      connectTimeout: "Connection timeout",
      authFailed: "Authentication failed",
      websocketError: "WebSocket error",
      connectionClosed: "Connection closed"
    },
    hints: {
      title: "Instructions",
      saveFirst: 'Click "Save" after filling in the configuration',
      connectWillSave: 'Click "Connect" will auto-save and connect',
      singleInstance: "Only one QQ Bot instance can be connected at a time",
      sandboxForTest: "Sandbox is for testing, production requires review"
    },
    status: {
      current: "Current",
      notConfigured: "Not Configured",
      activated: "Activated"
    }
  },
  systemPrompt: {
    enable: "Enable Custom System Prompt",
    enableDesc: "Customize the system prompt sent to AI",
    customPrompt: "Custom Prompt",
    placeholder: "Enter your custom system prompt...\n\nAvailable variables:\n{{workspaceName}} - Current workspace name\n{{workspacePath}} - Current workspace path\n{{contextWorkspaces}} - Context workspaces list\n{{date}} - Current date\n{{time}} - Current time\n{{defaultPrompt}} - Default system prompt",
    charCount: "{{count}} characters",
    reset: "Reset to Default",
    resetConfirm: "Are you sure you want to reset to default settings?",
    fillDefault: "Fill Default",
    showVariables: "Show Variables",
    hideVariables: "Hide Variables",
    variablesHint: "Click a variable to insert it into the editor:",
    variables: {
      workspaceName: "Current workspace name",
      workspacePath: "Current workspace path",
      contextWorkspaces: "Context workspaces list",
      date: "Current date",
      time: "Current time",
      defaultPrompt: "Default system prompt"
    },
    preview: "Preview",
    previewDefault: "(Using default prompt)",
    previewDefaultLabel: "[Default Prompt]",
    previewNote: "\u6B64\u5185\u5BB9\u4F1A\u4F5C\u4E3A\u7CFB\u7EDF\u63D0\u793A\u8BCD\u53D1\u9001\uFF0C\u5DE5\u4F5C\u533A\u4FE1\u606F\u4F1A\u81EA\u52A8\u8FFD\u52A0"
  },
  web: {
    enableTitle: "Enable Web Service",
    enableDesc: "Allow browser access to Polaris over LAN",
    portConfig: "Port Configuration",
    host: "Listen Address",
    hostHint: "0.0.0.0 for all interfaces, 127.0.0.1 for localhost only",
    port: "Listen Port",
    portHint: "Use a port in the range 1024-65535",
    applyTitle: "Apply Configuration",
    applyDesc: "Save and click 'Apply' to take effect immediately \u2014 no restart needed",
    applyButton: "Apply",
    applyFailed: "Failed to apply, please try again",
    serverStarted: "Web service started",
    serverStopped: "Web service stopped",
    accessInfo: "Access Information",
    accessUrl: "Access URL",
    otherAccessUrl: "Other Access URL",
    selectAddress: "Select Address",
    accessHint: "Instructions",
    accessHintDesc: "Save Web settings to take effect immediately. Open the access URL in a browser to use directly.",
    openInBrowser: "Open in Browser",
    actualPort: "Actual Port",
    actualPortHint: "Preferred port is in use; currently using {{port}}",
    qrTitle: "Scan to Access",
    qrHint: "Scan the QR code with your phone to access the Polaris web interface",
    qrNoIp: "No LAN IP detected. Please check your network connection.",
    qrDisabled: "QR code will appear after enabling Web service",
    connectionLost: "Web Service Connection Lost",
    connectionLostDesc: "Real-time updates unavailable. Please check if the desktop app is running.",
    connectionRestored: "Connection Restored",
    token: "Access Token",
    tokenPlaceholder: "Leave empty to disable auth",
    tokenHint: "Empty = no check. When set, every Web API request will include this token (MD5 on frontend before sending)."
  },
  appUpdate: {
    title: "App Update",
    description: "Check GitHub Releases for MSI updates and view historical versions.",
    desktopAvailable: "Desktop app",
    desktopOnly: "Desktop only",
    currentVersion: "Current version",
    latestRelease: "Latest release",
    source: "Source",
    check: "Check for updates",
    installAndRestart: "Install and restart",
    checkAndInstall: "Check and update",
    autoUpdateNote: "Once triggered, the update downloads, installs, and restarts automatically without further confirmation. Save your work before proceeding.",
    updateDone: "Update complete",
    updateDoneDesc: "The new version has been installed and restarted.",
    localManifestPath: "Local package path",
    customManifestUrl: "Manifest URL",
    githubRepo: "GitHub repository",
    updateAvailable: "Update available",
    updateAvailableDesc: "Version {{version}} is ready to install.",
    upToDate: "Up to date",
    upToDateDesc: "You are already using the latest version.",
    checkFailed: "Failed to check for updates",
    installFailed: "Failed to install update",
    availableVersion: "Available version: {{version}}",
    downloading: "Downloading update",
    historyTitle: "Release history",
    historyDesc: "View published GitHub Releases and download MSI installers.",
    refreshReleases: "Refresh releases",
    noReleases: "No releases found",
    current: "Current",
    prerelease: "Prerelease",
    download: "Download",
    downloadMsi: "Download MSI",
    openRelease: "Open release",
    rollbackWarning: "Rollback installs an older MSI and may require uninstalling the current version first. Back up user configuration before downgrading."
  },
  focus: {
    title: "Reading Focus Mode",
    hint: "Reduce visual distraction, focus on current content. Shortcuts Alt+F / Alt+Shift+F",
    off: "Off",
    offDesc: "No focus",
    l1: "Semantic",
    l1Desc: "Highlight hovered block, dim others",
    l2: "Spotlight",
    l2Desc: "Overlay mask, clear at cursor",
    desktopOnly: "Desktop only: no hover on touch devices.",
    dimOpacity: "Sibling dim",
    spotRadius: "Spotlight radius",
    spotBlur: "Outer blur",
    noBlur: "No blur",
    spotBlurHint: "Set 0 on low-end machines (dim only, no blur)"
  },
  uiControl: {
    title: "AI \u754C\u9762\u63A7\u5236",
    description: "\u5141\u8BB8 AI \u8C03\u6574\u4E3B\u9898\u914D\u8272\u4E0E\u5BF9\u8BDD\u6E32\u67D3\u914D\u7F6E\uFF08\u5B57\u53F7\u3001\u6D88\u606F\u95F4\u8DDD\u7B49\uFF09\uFF0C\u4E09\u7AEF\u540C\u6E90\u751F\u6548",
    hint: "\u5173\u95ED\u65F6\u9690\u85CF bus \u4E2D\u7684 cap.ui.* \u5DE5\u5177\uFF1B\u5F00\u542F\u540E AI \u5373\u53EF\u7ECF\u5DE5\u5177\u8C03\u7528\u63A7\u5236\u754C\u9762\u6837\u5F0F"
  },
  autolaunch: {
    title: "\u5F00\u673A\u81EA\u52A8\u542F\u52A8",
    description: "\u767B\u5F55\u7CFB\u7EDF\u540E\u81EA\u52A8\u542F\u52A8 Polaris\uFF08\u6700\u5C0F\u5316\u542F\u52A8\uFF0C\u4E0D\u62A2\u7126\u70B9\uFF09",
    hint: "\u4FDD\u5B58\u540E\u751F\u6548\uFF1B\u5347\u7EA7/\u632A\u76EE\u5F55\u5BFC\u81F4\u7684\u8DEF\u5F84\u6F02\u79FB\u4F1A\u5728\u4E0B\u6B21\u542F\u52A8\u65F6\u81EA\u52A8\u7EA0\u6B63"
  },
  mobileConnection: {
    title: "\u79FB\u52A8\u7AEF\u8FDE\u63A5\u7BA1\u7406",
    connected: "\u5DF2\u8FDE\u63A5",
    disconnected: "\u672A\u8FDE\u63A5",
    hint: "\u7BA1\u7406\u79FB\u52A8\u7AEF\u4E0E\u684C\u9762\u7AEF\u7684\u8FDE\u63A5\uFF0C\u53EF\u67E5\u770B\u72B6\u6001\u6216\u65AD\u5F00\u8FDE\u63A5",
    manage: "\u7BA1\u7406\u8FDE\u63A5"
  },
  performance: {
    migrationBanner: {
      title: "\u6027\u80FD\u4F18\u5316\u66F4\u65B0",
      goSettings: "\u67E5\u770B\u5F00\u5173",
      dismiss: "\u77E5\u9053\u4E86"
    },
    overview: "\u5F53\u524D\u5DF2\u5F00\u542F {{active}}/{{total}} \u4E2A\u529F\u80FD",
    allOff: "\u5168\u90E8\u5173\u95ED \xB7 \u6700\u8F7B\u91CF",
    tips: "\u9ED8\u8BA4\u5168\u90E8\u5173\u95ED\u4EE5\u8282\u7701\u8D44\u6E90\uFF0C\u6309\u9700\u5F00\u542F\u3002\u914D\u7F6E\u53D8\u66F4\u5373\u65F6\u751F\u6548\uFF0C\u65E0\u9700\u91CD\u542F\u5E94\u7528\u3002",
    switchOff: "\u5173\u95ED {{name}}",
    switchOn: "\u5F00\u542F {{name}}",
    notes: "\u6CE8\u610F\u4E8B\u9879",
    note2: "\u63D2\u4EF6\u670D\u52A1\u81EA\u52A8\u542F\u52A8\u5173\u95ED\u540E\uFF0C\u9996\u6B21\u4F7F\u7528\u63D2\u4EF6\u529F\u80FD\u65F6\u4F1A\u6709\u77ED\u6682\u7B49\u5F85\uFF082-3 \u79D2\uFF09",
    note3: "\u5982\u679C\u4E0D\u786E\u5B9A\uFF0C\u4FDD\u6301\u9ED8\u8BA4\u5173\u95ED\u5373\u53EF\u83B7\u5F97\u6700\u4F73\u6027\u80FD"
  },
  common: {
    loading: "",
    saving: "",
    save: ""
  },
  textarea: "",
  theme: {
    guideTitle: "\u4E3B\u9898\u751F\u6210\u6307\u5357"
  }
};

// locales/zh-CN-systemPrompt.json
var zh_CN_systemPrompt_default = {
  workingIn: "\u4F60\u6B63\u5728 {{name}} \u9879\u76EE\u4E2D\u5DE5\u4F5C\u3002",
  projectPath: "\u9879\u76EE\u8DEF\u5F84: {{path}}",
  fileRefSyntax: "\u6587\u4EF6\u5F15\u7528\u8BED\u6CD5: @/path",
  contextWorkspaces: "\u5173\u8054\u5DE5\u4F5C\u533A:",
  refSyntax: "\u5F15\u7528\u8BED\u6CD5: @{{name}}:path",
  workspaceToolGuidance: "\u5F53\u9700\u8981\u5904\u7406\u5F85\u529E\u3001\u5B9A\u65F6\u4EFB\u52A1\u6216\u9700\u6C42\u5E93\u65F6\uFF0C\u4F18\u5148\u4F7F\u7528\u5F53\u524D\u5DE5\u4F5C\u533A\u63D0\u4F9B\u7684 MCP \u5DE5\u5177\uFF0C\u4E0D\u8981\u4F9D\u8D56\u76F4\u63A5\u8BFB\u5199 .polaris/*.json \u7684\u63D0\u793A\u6D41\u7A0B\u3002"
};

// locales/en-US-systemPrompt.json
var en_US_systemPrompt_default = {
  workingIn: "You are working in the {{name}} project.",
  projectPath: "Project path: {{path}}",
  fileRefSyntax: "File reference syntax: @/path",
  contextWorkspaces: "Context workspaces:",
  refSyntax: "Reference syntax: @{{name}}:path",
  workspaceToolGuidance: "When handling scheduled tasks, prefer workspace-scoped MCP tools instead of direct .polaris/*.json file-editing instructions."
};

// src/i18nShim.ts
var merged = false;
function hostI18n() {
  return globalThis.__POLARIS_APP_CORE__?.i18n;
}
function ensureMerged() {
  const inst = hostI18n();
  if (inst && !merged && typeof inst.addResourceBundle === "function") {
    try {
      inst.addResourceBundle("zh-CN", "settings", zh_CN_default, true, true);
      inst.addResourceBundle("en-US", "settings", en_US_default, true, true);
      inst.addResourceBundle("zh-CN", "systemPrompt", zh_CN_systemPrompt_default, true, true);
      inst.addResourceBundle("en-US", "systemPrompt", en_US_systemPrompt_default, true, true);
      merged = true;
    } catch {
    }
  }
  return inst;
}
function useTranslation(...namespaces) {
  const inst = ensureMerged();
  const ns = Array.isArray(namespaces) && namespaces.length > 0 ? namespaces[0] : void 0;
  if (!inst) {
    return { t: (key, opts) => key, i18n: void 0 };
  }
  return {
    t: (key, opts) => inst.t(key, { ns, ...typeof opts === "object" && opts ? opts : {} }),
    i18n: inst
  };
}

// src/deps.ts
function core() {
  const c = globalThis.__POLARIS_APP_CORE__;
  if (!c?.stores) throw new Error("\u5BBF\u4E3B App Core \u672A\u6302\u8F7D\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u540E\u518D\u6253\u5F00\u672C\u63D2\u4EF6\u3002");
  return c;
}
function forwardStore(name) {
  const fn = (...args) => {
    const hook = core().stores[name];
    if (typeof hook !== "function") throw new Error(`\u5BBF\u4E3B ${name} \u4E0D\u53EF\u7528`);
    return hook(...args);
  };
  return new Proxy(fn, {
    get: (_t, prop) => {
      const hook = core().stores[name];
      const v = hook[prop];
      return typeof v === "function" ? v.bind(hook) : v;
    }
  });
}
var useConfigStore = forwardStore("useConfigStore");
var useToastStore = forwardStore("useToastStore");
var useWorkspaceStore = forwardStore("useWorkspaceStore");
var usePluginStore = forwardStore("usePluginStore");
var usePluginServiceStore = forwardStore("usePluginServiceStore");
var useEngineMetadataStore = forwardStore("useEngineMetadataStore");
var useThemeStore = forwardStore("useThemeStore");
var useFocusModeStore = forwardStore("useFocusModeStore");
var useContainerWidth = (...args) => core().hooks.useContainerWidth(...args);
function forwardComponent(ns, name) {
  return new Proxy(function() {
  }, {
    construct: (_t, args) => {
      const v = core()[ns][name];
      return new v(...args);
    },
    get: (_t, prop) => {
      const v = core()[ns][name];
      const m = v?.[prop];
      return typeof m === "function" ? m.bind(v) : m;
    },
    apply: (_t, _thisArg, args) => {
      const v = core()[ns][name];
      if (v && typeof v === "object" && typeof v.render === "function") return v.render(...args);
      return v(...args);
    }
  });
}
var Button = forwardComponent("components", "Button");
var ExternalLink = forwardComponent("components", "ExternalLink");
var pluginRegistry = new Proxy({}, { get: (_t, p) => core().pluginSystem.pluginRegistry?.[p] });
var listPluginMcpServerStatuses = (...args) => core().pluginSystem.listPluginMcpServerStatuses(...args);
var getPluginIconComponent = new Proxy(function() {
}, {
  apply: (_t, _this, args) => core().services.getPluginIconComponent(...args),
  construct: (_t, args) => new (core().services.getPluginIconComponent(...args))(...args)
});
var pluginServiceManager = new Proxy({}, { get: (_t, p) => core().services.pluginServiceManager?.[p] });
var pluginConfig = new Proxy({}, { get: (_t, p) => core().services.pluginConfig?.[p] });
function invoke(cmd, args) {
  return core().services.transport.invoke(cmd, args);
}
function listen(event, handler) {
  return core().services.transport.listen(event, handler);
}
var currentMode2 = core().services.transport.currentMode;
var pluginDiscoveryService = new Proxy({}, { get: (_t, p) => core().services.pluginDiscoveryService?.[p] });
var pluginToolService = new Proxy({}, { get: (_t, p) => core().services.pluginToolService?.[p] });
var mcpHealthService = new Proxy({}, { get: (_t, p) => core().services.mcpHealthService?.[p] });
var dataRootService = new Proxy({}, { get: (_t, p) => core().services.dataRootService?.[p] });
var autolaunchService = new Proxy({}, { get: (_t, p) => core().services.autolaunchService?.[p] });
var appUpdateService = new Proxy({}, { get: (_t, p) => core().services.appUpdateService?.[p] });
var updateService = new Proxy({}, { get: (_t, p) => core().services.updateService?.[p] });
var systemPromptStore = new Proxy({}, { get: (_t, p) => core().services.systemPromptStore?.[p] });
var windowService = new Proxy({}, { get: (_t, p) => core().services.windowService?.[p] });
var configService = new Proxy({}, { get: (_t, p) => core().services.configService?.[p] });
var listMcpHealthStatuses = (...args) => core().services.mcpHealthService.listMcpHealthStatuses(...args);
var listPluginTools = (...args) => core().services.pluginToolService.listPluginTools(...args);
var setPluginTools = (...args) => core().services.pluginToolService.setPluginTools(...args);
var discoverInstalledPlugins = (...args) => core().services.pluginDiscoveryService.discoverInstalledPlugins(...args);
var getPluginInstallLocations = (...args) => core().services.pluginDiscoveryService.getPluginInstallLocations(...args);
var installLocalPlugin = (...args) => core().services.pluginDiscoveryService.installLocalPlugin(...args);
var installPluginPackage = (...args) => core().services.pluginDiscoveryService.installPluginPackage(...args);
var installRemotePlugin = (...args) => core().services.pluginDiscoveryService.installRemotePlugin(...args);
var devLinkPlugin = (...args) => core().services.pluginDiscoveryService.devLinkPlugin(...args);
var uninstallPluginWithCleanup = (...args) => core().services.pluginDiscoveryService.uninstallPluginWithCleanup(...args);
var forceUninstallPlugin = (...args) => core().services.pluginDiscoveryService.forceUninstallPlugin(...args);
var checkPluginUpdate = (...args) => core().services.pluginDiscoveryService.checkPluginUpdate(...args);
var applyPluginUpdate = (...args) => core().services.pluginDiscoveryService.applyPluginUpdate(...args);
var getDataRootInfo = (...args) => core().services.dataRootService.getDataRootInfo(...args);
var getAutolaunchStatus = (...args) => core().services.autolaunchService.getAutolaunchStatus(...args);
var getUpdateStatus = (...args) => core().services.appUpdateService.getUpdateStatus(...args);
var runAutoUpdate = (...args) => core().services.appUpdateService.runAutoUpdate(...args);
var listenUpdateProgress = (...args) => core().services.appUpdateService.listenUpdateProgress(...args);
var listenUpdateCompleted = (...args) => core().services.appUpdateService.listenUpdateCompleted(...args);
var listAppReleases = (...args) => core().services.updateService.listAppReleases(...args);
var useSystemPromptStore = forwardStore("useSystemPromptStore");
var applyWebServer = (...args) => core().services.configService.applyWebServer(...args);
var getConfig = (...args) => core().services.configService.getConfig(...args);
var getWebServerStatus = (...args) => core().services.configService.getWebServerStatus(...args);
var openInBrowser = (...args) => core().services.windowService.openInBrowser(...args);
var openInDefaultApp = (...args) => core().services.windowService.openInDefaultApp(...args);
var getPluginConfig = (...args) => core().pluginConfig.getPluginConfig(...args);
var setPluginConfig = (...args) => core().pluginConfig.setPluginConfig(...args);

// src/SettingsSidebar.tsx
import { useMemo } from "react";

// src/icons/EngineIcons.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function IconAIEngine({ size = 16, className = "", ...props }) {
  return /* @__PURE__ */ jsxs(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      className,
      ...props,
      children: [
        /* @__PURE__ */ jsx(
          "rect",
          {
            x: "3",
            y: "3",
            width: "10",
            height: "10",
            rx: "2",
            stroke: "currentColor",
            strokeWidth: "1.5"
          }
        ),
        /* @__PURE__ */ jsx(
          "circle",
          {
            cx: "8",
            cy: "8",
            r: "2.5",
            stroke: "currentColor",
            strokeWidth: "1.5"
          }
        ),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M8 1V3M8 13V15M1 8H3M13 8H15",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinecap: "round"
          }
        ),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M3.5 3.5L2 2M3.5 12.5L2 14M12.5 3.5L14 2M12.5 12.5L14 14",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinecap: "round"
          }
        )
      ]
    }
  );
}
function IconSearch({ size = 16, className = "", ...props }) {
  return /* @__PURE__ */ jsxs(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      className,
      ...props,
      children: [
        /* @__PURE__ */ jsx(
          "circle",
          {
            cx: "6.5",
            cy: "6.5",
            r: "5",
            stroke: "currentColor",
            strokeWidth: "1.5"
          }
        ),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M10.5 10.5L14.5 14.5",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinecap: "round"
          }
        )
      ]
    }
  );
}
function IconGeneral({ size = 16, className = "", ...props }) {
  return /* @__PURE__ */ jsxs(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      className,
      ...props,
      children: [
        /* @__PURE__ */ jsx(
          "circle",
          {
            cx: "8",
            cy: "8",
            r: "6.5",
            stroke: "currentColor",
            strokeWidth: "1.5"
          }
        ),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M5 8H11",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinecap: "round"
          }
        ),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M8 5V11",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinecap: "round"
          }
        )
      ]
    }
  );
}

// node_modules/lucide-react/dist/esm/createLucideIcon.js
import { forwardRef as forwardRef2, createElement as createElement2 } from "react";

// node_modules/lucide-react/dist/esm/shared/src/utils.js
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
var toCamelCase = (string) => string.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase()
);
var toPascalCase = (string) => {
  const camelCase = toCamelCase(string);
  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
};
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();
var hasA11yProp = (props) => {
  for (const prop in props) {
    if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
      return true;
    }
  }
};

// node_modules/lucide-react/dist/esm/Icon.js
import { forwardRef, createElement } from "react";

// node_modules/lucide-react/dist/esm/defaultAttributes.js
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

// node_modules/lucide-react/dist/esm/Icon.js
var Icon = forwardRef(
  ({
    color = "currentColor",
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className = "",
    children,
    iconNode,
    ...rest
  }, ref) => createElement(
    "svg",
    {
      ref,
      ...defaultAttributes,
      width: size,
      height: size,
      stroke: color,
      strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
      className: mergeClasses("lucide", className),
      ...!children && !hasA11yProp(rest) && { "aria-hidden": "true" },
      ...rest
    },
    [
      ...iconNode.map(([tag, attrs]) => createElement(tag, attrs)),
      ...Array.isArray(children) ? children : [children]
    ]
  )
);

// node_modules/lucide-react/dist/esm/createLucideIcon.js
var createLucideIcon = (iconName, iconNode) => {
  const Component = forwardRef2(
    ({ className, ...props }, ref) => createElement2(Icon, {
      ref,
      iconNode,
      className: mergeClasses(
        `lucide-${toKebabCase(toPascalCase(iconName))}`,
        `lucide-${iconName}`,
        className
      ),
      ...props
    })
  );
  Component.displayName = toPascalCase(iconName);
  return Component;
};

// node_modules/lucide-react/dist/esm/icons/blocks.js
var __iconNode = [
  [
    "path",
    {
      d: "M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2",
      key: "1ah6g2"
    }
  ],
  ["rect", { x: "14", y: "2", width: "8", height: "8", rx: "1", key: "88lufb" }]
];
var Blocks = createLucideIcon("blocks", __iconNode);

// node_modules/lucide-react/dist/esm/icons/book-open.js
var __iconNode2 = [
  ["path", { d: "M12 7v14", key: "1akyts" }],
  [
    "path",
    {
      d: "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",
      key: "ruj8y"
    }
  ]
];
var BookOpen = createLucideIcon("book-open", __iconNode2);

// node_modules/lucide-react/dist/esm/icons/check.js
var __iconNode3 = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]];
var Check = createLucideIcon("check", __iconNode3);

// node_modules/lucide-react/dist/esm/icons/chevron-down.js
var __iconNode4 = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]];
var ChevronDown = createLucideIcon("chevron-down", __iconNode4);

// node_modules/lucide-react/dist/esm/icons/chevron-right.js
var __iconNode5 = [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]];
var ChevronRight = createLucideIcon("chevron-right", __iconNode5);

// node_modules/lucide-react/dist/esm/icons/circle-check.js
var __iconNode6 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
];
var CircleCheck = createLucideIcon("circle-check", __iconNode6);

// node_modules/lucide-react/dist/esm/icons/copy.js
var __iconNode7 = [
  ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2", key: "17jyea" }],
  ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2", key: "zix9uf" }]
];
var Copy = createLucideIcon("copy", __iconNode7);

// node_modules/lucide-react/dist/esm/icons/download.js
var __iconNode8 = [
  ["path", { d: "M12 15V3", key: "m9g1x1" }],
  ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", key: "ih7n3h" }],
  ["path", { d: "m7 10 5 5 5-5", key: "brsn70" }]
];
var Download = createLucideIcon("download", __iconNode8);

// node_modules/lucide-react/dist/esm/icons/external-link.js
var __iconNode9 = [
  ["path", { d: "M15 3h6v6", key: "1q9fwt" }],
  ["path", { d: "M10 14 21 3", key: "gplh6r" }],
  ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6", key: "a6xqqp" }]
];
var ExternalLink2 = createLucideIcon("external-link", __iconNode9);

// node_modules/lucide-react/dist/esm/icons/folder-open.js
var __iconNode10 = [
  [
    "path",
    {
      d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
      key: "usdka0"
    }
  ]
];
var FolderOpen = createLucideIcon("folder-open", __iconNode10);

// node_modules/lucide-react/dist/esm/icons/globe.js
var __iconNode11 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20", key: "13o1zl" }],
  ["path", { d: "M2 12h20", key: "9i4pu4" }]
];
var Globe = createLucideIcon("globe", __iconNode11);

// node_modules/lucide-react/dist/esm/icons/link-2.js
var __iconNode12 = [
  ["path", { d: "M9 17H7A5 5 0 0 1 7 7h2", key: "8i5ue5" }],
  ["path", { d: "M15 7h2a5 5 0 1 1 0 10h-2", key: "1b9ql8" }],
  ["line", { x1: "8", x2: "16", y1: "12", y2: "12", key: "1jonct" }]
];
var Link2 = createLucideIcon("link-2", __iconNode12);

// node_modules/lucide-react/dist/esm/icons/loader-circle.js
var __iconNode13 = [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]];
var LoaderCircle = createLucideIcon("loader-circle", __iconNode13);

// node_modules/lucide-react/dist/esm/icons/package-plus.js
var __iconNode14 = [
  ["path", { d: "M16 16h6", key: "100bgy" }],
  ["path", { d: "M19 13v6", key: "85cyf1" }],
  [
    "path",
    {
      d: "M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14",
      key: "e7tb2h"
    }
  ],
  ["path", { d: "m7.5 4.27 9 5.15", key: "1c824w" }],
  ["polyline", { points: "3.29 7 12 12 20.71 7", key: "ousv84" }],
  ["line", { x1: "12", x2: "12", y1: "22", y2: "12", key: "a4e8g8" }]
];
var PackagePlus = createLucideIcon("package-plus", __iconNode14);

// node_modules/lucide-react/dist/esm/icons/package.js
var __iconNode15 = [
  [
    "path",
    {
      d: "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",
      key: "1a0edw"
    }
  ],
  ["path", { d: "M12 22V12", key: "d0xqtd" }],
  ["polyline", { points: "3.29 7 12 12 20.71 7", key: "ousv84" }],
  ["path", { d: "m7.5 4.27 9 5.15", key: "1c824w" }]
];
var Package = createLucideIcon("package", __iconNode15);

// node_modules/lucide-react/dist/esm/icons/palette.js
var __iconNode16 = [
  [
    "path",
    {
      d: "M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z",
      key: "e79jfc"
    }
  ],
  ["circle", { cx: "13.5", cy: "6.5", r: ".5", fill: "currentColor", key: "1okk4w" }],
  ["circle", { cx: "17.5", cy: "10.5", r: ".5", fill: "currentColor", key: "f64h9f" }],
  ["circle", { cx: "6.5", cy: "12.5", r: ".5", fill: "currentColor", key: "qy21gx" }],
  ["circle", { cx: "8.5", cy: "7.5", r: ".5", fill: "currentColor", key: "fotxhn" }]
];
var Palette = createLucideIcon("palette", __iconNode16);

// node_modules/lucide-react/dist/esm/icons/plug-zap.js
var __iconNode17 = [
  [
    "path",
    { d: "M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z", key: "goz73y" }
  ],
  ["path", { d: "m2 22 3-3", key: "19mgm9" }],
  ["path", { d: "M7.5 13.5 10 11", key: "7xgeeb" }],
  ["path", { d: "M10.5 16.5 13 14", key: "10btkg" }],
  ["path", { d: "m18 3-4 4h6l-4 4", key: "16psg9" }]
];
var PlugZap = createLucideIcon("plug-zap", __iconNode17);

// node_modules/lucide-react/dist/esm/icons/plug.js
var __iconNode18 = [
  ["path", { d: "M12 22v-5", key: "1ega77" }],
  ["path", { d: "M15 8V2", key: "18g5xt" }],
  [
    "path",
    { d: "M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z", key: "1xoxul" }
  ],
  ["path", { d: "M9 8V2", key: "14iosj" }]
];
var Plug = createLucideIcon("plug", __iconNode18);

// node_modules/lucide-react/dist/esm/icons/puzzle.js
var __iconNode19 = [
  [
    "path",
    {
      d: "M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z",
      key: "w46dr5"
    }
  ]
];
var Puzzle = createLucideIcon("puzzle", __iconNode19);

// node_modules/lucide-react/dist/esm/icons/refresh-cw.js
var __iconNode20 = [
  ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", key: "v9h5vc" }],
  ["path", { d: "M21 3v5h-5", key: "1q7to0" }],
  ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", key: "3uifl3" }],
  ["path", { d: "M8 16H3v5", key: "1cv678" }]
];
var RefreshCw = createLucideIcon("refresh-cw", __iconNode20);

// node_modules/lucide-react/dist/esm/icons/smartphone.js
var __iconNode21 = [
  ["rect", { width: "14", height: "20", x: "5", y: "2", rx: "2", ry: "2", key: "1yt0o3" }],
  ["path", { d: "M12 18h.01", key: "mhygvu" }]
];
var Smartphone = createLucideIcon("smartphone", __iconNode21);

// node_modules/lucide-react/dist/esm/icons/trash-2.js
var __iconNode22 = [
  ["path", { d: "M10 11v6", key: "nco0om" }],
  ["path", { d: "M14 11v6", key: "outv1u" }],
  ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", key: "miytrc" }],
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", key: "e791ji" }]
];
var Trash2 = createLucideIcon("trash-2", __iconNode22);

// node_modules/lucide-react/dist/esm/icons/triangle-alert.js
var __iconNode23 = [
  [
    "path",
    {
      d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
      key: "wmoenq"
    }
  ],
  ["path", { d: "M12 9v4", key: "juzpu7" }],
  ["path", { d: "M12 17h.01", key: "p32p05" }]
];
var TriangleAlert = createLucideIcon("triangle-alert", __iconNode23);

// src/platform.ts
function mode() {
  const viaCore = globalThis.__POLARIS_APP_CORE__?.services?.transport?.currentMode;
  if (typeof viaCore === "string") return viaCore;
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window ? "tauri" : "http";
}
var isTauri = () => mode() === "tauri";

// src/SettingsSidebar.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var NAV_ITEMS = [
  { id: "general", icon: /* @__PURE__ */ jsx2(IconGeneral, { size: 16 }), labelKey: "nav.general" },
  { id: "theme", icon: /* @__PURE__ */ jsx2(Palette, { size: 16 }), labelKey: "nav.theme" },
  { id: "ai-engine", icon: /* @__PURE__ */ jsx2(IconAIEngine, { size: 16 }), labelKey: "nav.aiEngine" },
  { id: "plugins", icon: /* @__PURE__ */ jsx2(Blocks, { size: 16 }), labelKey: "nav.plugins" },
  { id: "app-update", icon: /* @__PURE__ */ jsx2(Download, { size: 16 }), labelKey: "nav.appUpdate" },
  { id: "web", icon: /* @__PURE__ */ jsx2(Globe, { size: 16 }), labelKey: "nav.web" }
  // { id: 'advanced', icon: <IconSettings size={16} />, labelKey: 'nav.advanced' },
];
var DESKTOP_ONLY_TABS = ["app-update", "web"];
function SettingsSidebar({ wide, activeTab, onTabChange, searchQuery, onSearchChange }) {
  const { t: t2 } = useTranslation("settings");
  const isDesktop = isTauri();
  const navItems = useMemo(
    () => isDesktop ? NAV_ITEMS : NAV_ITEMS.filter((item) => !DESKTOP_ONLY_TABS.includes(item.id)),
    [isDesktop]
  );
  return /* @__PURE__ */ jsxs2(
    "div",
    {
      "data-theme-panel": true,
      className: wide ? "w-56 flex-shrink-0 border-r border-border-subtle bg-background-elevated flex flex-col" : "border-b border-border-subtle bg-background-elevated flex",
      children: [
        /* @__PURE__ */ jsx2("div", { className: `${wide ? "block" : "hidden"} p-3 border-b border-border-subtle`, children: /* @__PURE__ */ jsxs2("div", { className: "relative", children: [
          /* @__PURE__ */ jsx2(
            "input",
            {
              type: "text",
              value: searchQuery,
              onChange: (e) => onSearchChange(e.target.value),
              placeholder: t2("search"),
              className: "w-full bg-surface border border-border-subtle rounded-lg px-3 py-1.5 pr-8 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-primary"
            }
          ),
          /* @__PURE__ */ jsx2("span", { className: "absolute right-2 top-1/2 -translate-y-1/2 text-text-muted", children: /* @__PURE__ */ jsx2(IconSearch, { size: 14 }) })
        ] }) }),
        /* @__PURE__ */ jsx2("nav", { className: `flex ${wide ? "flex-col flex-1 overflow-y-auto py-2" : "overflow-x-auto py-0"}`, children: navItems.map((item) => /* @__PURE__ */ jsxs2(
          "button",
          {
            onClick: () => onTabChange(item.id),
            className: `flex-shrink-0 ${wide ? "w-full" : ""} flex items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${activeTab === item.id ? wide ? "bg-primary/10 text-primary border-r-2 border-primary" : "bg-primary/10 text-primary border-b-2 border-primary" : "text-text-secondary hover:bg-surface hover:text-text-primary"}`,
            children: [
              /* @__PURE__ */ jsx2("span", { className: "flex-shrink-0", children: item.icon }),
              /* @__PURE__ */ jsx2("span", { className: "whitespace-nowrap", children: t2(item.labelKey) })
            ]
          },
          item.id
        )) })
      ]
    }
  );
}

// src/tabs/AIEngineTab.tsx
import { useState as useState2, useMemo as useMemo2, useEffect as useEffect2, useRef as useRef2 } from "react";

// src/EngineInstallActions.tsx
import { useState, useRef, useEffect, useCallback } from "react";

// src/logger.ts
var LogLevelNames = {
  [0 /* Trace */]: "trace",
  [1 /* Debug */]: "debug",
  [2 /* Info */]: "info",
  [3 /* Warn */]: "warn",
  [4 /* Error */]: "error",
  [5 /* Fatal */]: "fatal"
};
var LogLevelColors = {
  [0 /* Trace */]: "\x1B[90m",
  // 灰色
  [1 /* Debug */]: "\x1B[36m",
  // 青色
  [2 /* Info */]: "\x1B[32m",
  // 绿色
  [3 /* Warn */]: "\x1B[33m",
  // 黄色
  [4 /* Error */]: "\x1B[31m",
  // 红色
  [5 /* Fatal */]: "\x1B[35m"
  // 紫色
};
var ResetColor = "\x1B[0m";
var ConsoleTransport = class {
  name = "console";
  level = 2 /* Info */;
  constructor(level) {
    this.level = level ?? 2 /* Info */;
  }
  setLevel(level) {
    this.level = level;
  }
  log(entry) {
    if (entry.level < this.level) return;
    const color = LogLevelColors[entry.level];
    const levelName = LogLevelNames[entry.level].toUpperCase().padEnd(5);
    const timestamp = entry.timestamp.split("T")[1]?.slice(0, 12) || entry.timestamp;
    const moduleTag = `[${entry.module}]`;
    const prefix = `${color}${levelName}${ResetColor} ${timestamp} ${moduleTag}`;
    const method = this.getConsoleMethod(entry.level);
    if (entry.error) {
      method(prefix, entry.message, entry.context ?? "", "\n  Error:", entry.error.name, entry.error.message);
      if (entry.error.stack) {
        method("  Stack:", entry.error.stack);
      }
    } else if (entry.context && Object.keys(entry.context).length > 0) {
      method(prefix, entry.message, entry.context);
    } else {
      method(prefix, entry.message);
    }
  }
  getConsoleMethod(level) {
    switch (level) {
      case 5 /* Fatal */:
      case 4 /* Error */:
        return console.error.bind(console);
      case 3 /* Warn */:
        return console.warn.bind(console);
      case 2 /* Info */:
        return console.info.bind(console);
      default:
        return console.log.bind(console);
    }
  }
};
var JsonTransport = class {
  name = "json";
  level = 2 /* Info */;
  constructor(level) {
    this.level = level ?? 2 /* Info */;
  }
  setLevel(level) {
    this.level = level;
  }
  log(entry) {
    if (entry.level < this.level) return;
    console.log(JSON.stringify(entry));
  }
};
var ModuleLogger = class _ModuleLogger {
  config;
  transports;
  constructor(config) {
    this.config = {
      level: 2 /* Info */,
      transports: [new ConsoleTransport()],
      ...config
    };
    this.transports = this.config.transports ?? [];
  }
  /**
   * 获取当前日志级别
   */
  getLevel() {
    return this.config.level ?? 2 /* Info */;
  }
  /**
   * 设置日志级别
   */
  setLevel(level) {
    this.config.level = level;
    this.transports.forEach((t2) => t2.setLevel?.(level));
  }
  /**
   * 设置全局上下文
   */
  setContext(context) {
    this.config.context = { ...this.config.context, ...context };
  }
  /**
   * 清除上下文
   */
  clearContext() {
    this.config.context = void 0;
  }
  /**
   * 创建子日志器
   */
  child(subModule) {
    return new _ModuleLogger({
      ...this.config,
      module: `${this.config.module}:${subModule}`
    });
  }
  // ===== 日志方法 =====
  trace(message2, context) {
    this.log(0 /* Trace */, message2, void 0, context);
  }
  debug(message2, context) {
    this.log(1 /* Debug */, message2, void 0, context);
  }
  info(message2, context) {
    this.log(2 /* Info */, message2, void 0, context);
  }
  warn(message2, context) {
    this.log(3 /* Warn */, message2, void 0, context);
  }
  error(message2, error, context) {
    this.log(4 /* Error */, message2, error, context);
  }
  fatal(message2, error, context) {
    this.log(5 /* Fatal */, message2, error, context);
  }
  /**
   * 记录性能计时
   */
  time(label) {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.debug(`${label} completed`, { duration: `${duration.toFixed(2)}ms` });
    };
  }
  /**
   * 记录进入函数
   */
  enter(fn, args) {
    this.trace(`\u2192 ${fn}`, args);
  }
  /**
   * 记录退出函数
   */
  exit(fn, result) {
    this.trace(`\u2190 ${fn}`, result !== void 0 ? { result } : void 0);
  }
  // ===== 私有方法 =====
  log(level, message2, error, context) {
    if (level < (this.config.level ?? 2 /* Info */)) {
      return;
    }
    const entry = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      levelName: LogLevelNames[level],
      module: this.config.module,
      message: message2,
      context: { ...this.config.context, ...context },
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : void 0,
      sessionId: this.config.context?.sessionId,
      requestId: this.config.context?.requestId
    };
    for (const transport of this.transports) {
      try {
        transport.log(entry);
      } catch (e) {
        console.error("[Logger] Transport error:", e);
      }
    }
  }
};
var globalLevel = typeof import.meta !== "undefined" && import.meta.env?.DEV ? 1 /* Debug */ : 2 /* Info */;
var globalTransports = [];
var globalContext = {};
var loggerCache = /* @__PURE__ */ new Map();
function createLogger(module, options) {
  const cacheKey = module;
  if (loggerCache.has(cacheKey) && !options) {
    return loggerCache.get(cacheKey) ?? new ModuleLogger({ module });
  }
  const logger = new ModuleLogger({
    module,
    level: options?.level ?? globalLevel,
    transports: options?.transports ?? globalTransports,
    context: { ...globalContext, ...options?.context }
  });
  if (!options) {
    loggerCache.set(cacheKey, logger);
  }
  return logger;
}
if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
  globalTransports = [new ConsoleTransport(1 /* Debug */)];
} else {
  globalTransports = [new JsonTransport(2 /* Info */)];
}

// src/EngineInstallActions.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var log = createLogger("EngineInstallActions");
var taskSeq = 0;
function EngineInstallActions({
  engineId,
  npmPackage,
  installed,
  onChanged
}) {
  const { t: t2 } = useTranslation(["settings", "common"]);
  const [running, setRunning] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const logBoxRef = useRef(null);
  useEffect(() => {
    const box = logBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [logs]);
  const run = useCallback(
    async (op) => {
      if (running) return;
      const taskId = `${engineId}-${op}-${Date.now()}-${taskSeq++}`;
      setRunning(op);
      setLogs([]);
      setError(null);
      let unlisten = null;
      try {
        unlisten = await listen("engine-install:event", (ev) => {
          if (ev.taskId !== taskId) return;
          if ((ev.kind === "log" || ev.kind === "started") && ev.line) {
            setLogs((prev) => [...prev.slice(-199), ev.line]);
          } else if (ev.kind === "error" && ev.line) {
            setError(ev.line);
          }
        });
        if (op === "install") {
          await invoke("engine_install", { npmPackage, version: null, taskId });
        } else {
          await invoke("engine_uninstall", { npmPackage, taskId });
        }
        await onChanged();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.error(`engine ${op} failed: ${msg}`);
        setError((prev) => prev ?? msg);
      } finally {
        unlisten?.();
        setRunning(null);
      }
    },
    [engineId, npmPackage, onChanged, running]
  );
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxs3(
        "button",
        {
          type: "button",
          onClick: () => run("install"),
          disabled: running !== null,
          className: "flex items-center gap-1.5 text-xs px-3 py-2 rounded-md bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          children: [
            running === "install" ? /* @__PURE__ */ jsx3(LoaderCircle, { size: 13, className: "animate-spin" }) : /* @__PURE__ */ jsx3(Download, { size: 13 }),
            running === "install" ? t2("aiEngine.installing", { defaultValue: "\u5B89\u88C5\u4E2D\u2026" }) : installed ? t2("aiEngine.updateAction", { defaultValue: "\u66F4\u65B0\u5230\u6700\u65B0" }) : t2("aiEngine.installAction", { defaultValue: "\u4E00\u952E\u5B89\u88C5" })
          ]
        }
      ),
      installed && /* @__PURE__ */ jsxs3(
        "button",
        {
          type: "button",
          onClick: () => run("uninstall"),
          disabled: running !== null,
          className: "flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border border-red-500/40 bg-red-500/5 text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          children: [
            running === "uninstall" ? /* @__PURE__ */ jsx3(LoaderCircle, { size: 13, className: "animate-spin" }) : /* @__PURE__ */ jsx3(Trash2, { size: 13 }),
            running === "uninstall" ? t2("aiEngine.uninstalling", { defaultValue: "\u5378\u8F7D\u4E2D\u2026" }) : t2("aiEngine.uninstallAction", { defaultValue: "\u5378\u8F7D" })
          ]
        }
      ),
      /* @__PURE__ */ jsxs3("span", { className: "text-xs text-text-tertiary font-mono ml-auto truncate", children: [
        "npm i -g ",
        npmPackage
      ] })
    ] }),
    (logs.length > 0 || running) && /* @__PURE__ */ jsx3(
      "div",
      {
        ref: logBoxRef,
        className: "mt-3 max-h-32 overflow-auto rounded-md bg-background-surface border border-border p-2 font-mono text-xs leading-relaxed text-text-secondary whitespace-pre-wrap",
        children: logs.length === 0 ? /* @__PURE__ */ jsx3("span", { className: "text-text-tertiary", children: t2("aiEngine.installPreparing", { defaultValue: "\u51C6\u5907\u4E2D\u2026" }) }) : logs.map((line, i) => /* @__PURE__ */ jsx3("div", { children: line }, i))
      }
    ),
    error && /* @__PURE__ */ jsx3("div", { className: "mt-2 px-3 py-2 rounded-md text-xs bg-red-500/10 text-red-400 border border-red-500/20", children: error }),
    /* @__PURE__ */ jsx3("p", { className: "mt-2 text-xs text-text-tertiary", children: t2("aiEngine.installHint", {
      defaultValue: "\u901A\u8FC7 npm \u5168\u5C40\u5B89\u88C5\uFF0C\u9700\u672C\u673A\u5DF2\u5B89\u88C5 Node.js / npm \u5E76\u5728 PATH \u4E2D\u3002"
    }) })
  ] });
}

// src/types/engineMetadata.ts
function getDistributionLabel(dist) {
  switch (dist.type) {
    case "package-runner":
      return `npx ${dist.package}`;
    case "binary":
      return `${dist.cmd} v${dist.version}`;
    case "builtin":
      return "\u5185\u7F6E\u5F15\u64CE";
    case "custom-path":
      return dist.available ? dist.path : "\u672A\u68C0\u6D4B\u5230";
  }
}
function getCapabilityLabels(caps) {
  const labels = [];
  if (caps.tools) labels.push("\u5DE5\u5177\u8C03\u7528");
  if (caps.imageInput) labels.push("\u56FE\u7247\u8F93\u5165");
  if (caps.streaming) labels.push("\u6D41\u5F0F\u8F93\u51FA");
  if (caps.interrupt) labels.push("\u4E2D\u65AD");
  if (caps.resume) labels.push("\u7EED\u63A5\u4F1A\u8BDD");
  if (caps.stdinInput) labels.push("\u4EA4\u4E92\u8F93\u5165");
  if (caps.forkSession) labels.push("\u4F1A\u8BDD\u5206\u652F");
  return labels;
}

// src/EngineExpandDetail.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function CapabilityTags({ capabilities }) {
  const labels = getCapabilityLabels(capabilities);
  if (labels.length === 0) return null;
  return /* @__PURE__ */ jsx4("div", { className: "flex flex-wrap gap-1.5 mt-2", children: labels.map((label) => /* @__PURE__ */ jsx4(
    "span",
    {
      className: "text-xs px-2 py-0.5 rounded bg-primary/5 text-primary/70 border border-primary/10",
      children: label
    },
    label
  )) });
}
function EngineExpandDetail({
  engineId,
  meta,
  uiConfig,
  status,
  loading,
  refreshHealth,
  isDefault,
  onSetDefault
}) {
  const { t: t2 } = useTranslation(["settings", "common"]);
  return /* @__PURE__ */ jsxs4("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxs4("div", { className: "bg-surface border border-border rounded-lg p-4", children: [
      /* @__PURE__ */ jsxs4("div", { className: "flex items-start justify-between gap-3", children: [
        /* @__PURE__ */ jsxs4("div", { className: "min-w-0", children: [
          /* @__PURE__ */ jsxs4("h3", { className: "text-base font-medium text-text-primary flex items-center gap-2 flex-wrap", children: [
            t2(uiConfig?.nameKey ?? engineId),
            status.available && !uiConfig?.builtin && /* @__PURE__ */ jsx4("span", { className: "text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-500 border border-green-500/20", children: status.version ? `v${status.version.replace(/^v/, "")}` : "\u5DF2\u5B89\u88C5" }),
            uiConfig?.builtin && /* @__PURE__ */ jsx4("span", { className: "text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20", children: "\u5185\u7F6E" }),
            !status.available && !uiConfig?.builtin && /* @__PURE__ */ jsx4("span", { className: "text-xs px-2 py-0.5 rounded bg-text-tertiary/10 text-text-tertiary border border-border", children: "\u672A\u5B89\u88C5" }),
            meta?.stable === false && /* @__PURE__ */ jsx4("span", { className: "text-xs px-2 py-0.5 rounded bg-red-400/10 text-red-400 border border-red-400/20", children: "\u4E0D\u7A33\u5B9A" })
          ] }),
          uiConfig && /* @__PURE__ */ jsx4("p", { className: "text-sm text-text-secondary mt-1", children: t2(uiConfig.descKey ?? "") })
        ] }),
        /* @__PURE__ */ jsx4("div", { className: "shrink-0", children: isDefault ? /* @__PURE__ */ jsxs4("span", { className: "inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-primary/10 text-primary border border-primary/20", children: [
          /* @__PURE__ */ jsx4(Check, { size: 12 }),
          "\u5F53\u524D\u9ED8\u8BA4"
        ] }) : /* @__PURE__ */ jsx4(
          "button",
          {
            type: "button",
            onClick: onSetDefault,
            disabled: loading,
            className: "text-xs px-2.5 py-1.5 rounded-md border border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50",
            children: "\u8BBE\u4E3A\u9ED8\u8BA4"
          }
        ) })
      ] }),
      meta && /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-1.5 mt-2 text-xs text-text-tertiary", children: [
        /* @__PURE__ */ jsx4(Package, { size: 12 }),
        /* @__PURE__ */ jsx4("span", { className: "font-mono", children: getDistributionLabel(meta.distribution) })
      ] }),
      meta && /* @__PURE__ */ jsx4(CapabilityTags, { capabilities: meta.capabilities })
    ] }),
    !uiConfig?.builtin && uiConfig?.npmPackage && /* @__PURE__ */ jsx4("div", { className: "bg-surface border border-border rounded-lg p-4", children: /* @__PURE__ */ jsx4(
      EngineInstallActions,
      {
        engineId,
        npmPackage: uiConfig.npmPackage,
        installed: status.available,
        version: status.version,
        onChanged: refreshHealth
      }
    ) }),
    !uiConfig && meta?.distribution.type === "custom-path" && /* @__PURE__ */ jsxs4("div", { className: "bg-surface border border-border rounded-lg p-4 space-y-3", children: [
      /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-2 text-xs text-text-secondary", children: [
        /* @__PURE__ */ jsx4(Puzzle, { size: 13 }),
        /* @__PURE__ */ jsx4("span", { className: "font-medium", children: "\u63D2\u4EF6\u5F15\u64CE" }),
        (() => {
          const pluginId = pluginRegistry.getPluginIdForEngine(engineId);
          return pluginId ? /* @__PURE__ */ jsxs4("span", { className: "text-text-muted", children: [
            "\xB7 \u6765\u81EA\u63D2\u4EF6 ",
            pluginId
          ] }) : null;
        })()
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-2 text-sm", children: [
        /* @__PURE__ */ jsx4("span", { className: "font-mono text-text-primary", children: meta.distribution.path }),
        status.available ? /* @__PURE__ */ jsx4("span", { className: "text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-500 border border-green-500/20", children: "\u5DF2\u5B89\u88C5" }) : /* @__PURE__ */ jsx4("span", { className: "text-xs px-2 py-0.5 rounded bg-text-tertiary/10 text-text-tertiary border border-border", children: "\u672A\u5B89\u88C5" })
      ] }),
      meta.installGuide && /* @__PURE__ */ jsx4("div", { className: "text-xs text-text-tertiary leading-relaxed whitespace-pre-wrap", children: meta.installGuide }),
      !meta.installGuide && !status.available && /* @__PURE__ */ jsxs4("div", { className: "text-xs text-text-tertiary", children: [
        "\u8BF7\u786E\u4FDD ",
        /* @__PURE__ */ jsx4("code", { className: "font-mono bg-background-elevated px-1 rounded", children: meta.distribution.path }),
        " \u5DF2\u5B89\u88C5\u5E76\u5728 PATH \u4E2D\u53EF\u7528\u3002"
      ] }),
      meta.npmPackage && /* @__PURE__ */ jsx4(
        EngineInstallActions,
        {
          engineId,
          npmPackage: meta.npmPackage,
          installed: status.available,
          version: status.version,
          onChanged: refreshHealth
        }
      ),
      meta.installUrl && /* @__PURE__ */ jsxs4(
        "button",
        {
          type: "button",
          onClick: () => openInDefaultApp(meta.installUrl),
          className: "inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 transition-colors",
          children: [
            /* @__PURE__ */ jsx4(ExternalLink2, { size: 13 }),
            t2("aiEngine.openInstallPage", { defaultValue: "\u6253\u5F00\u5B89\u88C5\u9875\u9762" })
          ]
        }
      )
    ] }),
    uiConfig?.builtin && /* @__PURE__ */ jsx4("div", { className: "bg-surface border border-blue-500/15 rounded-lg p-4 text-xs text-text-secondary", children: t2("aiEngine.builtinHint", {
      defaultValue: "\u5185\u7F6E\u5F15\u64CE\u65E0\u9700\u5B89\u88C5\u5916\u90E8 CLI\uFF0C\u4F7F\u7528\u300C\u6A21\u578B\u4F9B\u5E94\u5546\u300D\u4E2D\u914D\u7F6E\u7684 API \u7AEF\u70B9\u8FD0\u884C\u3002"
    }) })
  ] });
}

// src/tabs/AIEngineTab.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var ENGINE_UI_MAP = {
  "claude-code": {
    id: "claude-code",
    nameKey: "engines.claudeCode.name",
    descKey: "engines.claudeCode.description",
    npmPackage: "@anthropic-ai/claude-code"
  },
  "simple-ai": {
    id: "simple-ai",
    nameKey: "engines.simpleAi.name",
    descKey: "engines.simpleAi.description",
    builtin: true
  }
};
function resolveEngineStatus(engineId, health, meta) {
  const uiConfig = ENGINE_UI_MAP[engineId];
  if (uiConfig?.builtin) return { available: true };
  const fields = engineId === "claude-code" ? { available: "claudeAvailable", version: "claudeVersion" } : null;
  if (fields && health) {
    return {
      available: !!health[fields.available],
      version: health[fields.version]
    };
  }
  if (meta?.distribution.type === "custom-path") {
    return { available: meta.distribution.available };
  }
  return { available: false };
}
function getTabBadge(engineId, status) {
  const uiConfig = ENGINE_UI_MAP[engineId];
  if (uiConfig?.builtin) {
    return { label: "\u5185\u7F6E", className: "text-blue-500 bg-blue-500/10 border-blue-500/20" };
  }
  if (status.available) {
    return {
      label: status.version ? `v${status.version.replace(/^v/, "")}` : "\u5DF2\u5B89\u88C5",
      className: "text-green-500 bg-green-500/10 border-green-500/20"
    };
  }
  return { label: "\u672A\u5B89\u88C5", className: "text-text-tertiary bg-text-tertiary/10 border-border" };
}
function getStabilityBadge(meta) {
  if (meta?.stable === false) {
    return { label: "\u4E0D\u7A33\u5B9A", className: "text-red-400 bg-red-400/10 border-red-400/20" };
  }
  return null;
}
var MAX_VISIBLE_TABS = 5;
function AIEngineTab({ config, onConfigChange, loading }) {
  const { t: t2 } = useTranslation(["settings", "common"]);
  const { healthStatus, refreshHealth } = useConfigStore();
  const [selectedId, setSelectedId] = useState2(config.defaultEngine);
  const [showMore, setShowMore] = useState2(false);
  const moreRef = useRef2(null);
  const engineMetadatas = useEngineMetadataStore((s) => s.metadatas);
  useEffect2(() => {
    const store = useEngineMetadataStore.getState();
    if (!store.loaded && !store.loading) {
      store.load();
    }
  }, []);
  useEffect2(() => {
    if (!showMore) return;
    const handleClick = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setShowMore(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMore]);
  const engineList = useMemo2(() => {
    if (engineMetadatas.length === 0) {
      return Object.values(ENGINE_UI_MAP);
    }
    return engineMetadatas.map((meta) => ({
      ...ENGINE_UI_MAP[meta.id],
      id: meta.id,
      nameKey: ENGINE_UI_MAP[meta.id]?.nameKey ?? meta.name,
      descKey: ENGINE_UI_MAP[meta.id]?.descKey ?? meta.description ?? ""
    }));
  }, [engineMetadatas]);
  const selectedMeta = useMemo2(
    () => engineMetadatas.find((m) => m.id === selectedId),
    [engineMetadatas, selectedId]
  );
  const selectedUiConfig = useMemo2(
    () => ENGINE_UI_MAP[selectedId],
    [selectedId]
  );
  const selectedStatus = useMemo2(
    () => resolveEngineStatus(selectedId, healthStatus, selectedMeta),
    [selectedId, healthStatus, selectedMeta]
  );
  const { visibleTabs, overflowEngines } = useMemo2(() => {
    if (engineList.length <= MAX_VISIBLE_TABS) {
      return { visibleTabs: engineList, overflowEngines: [] };
    }
    const selectedIdx = engineList.findIndex((e) => e.id === selectedId);
    if (selectedIdx < MAX_VISIBLE_TABS) {
      return { visibleTabs: engineList.slice(0, MAX_VISIBLE_TABS), overflowEngines: engineList.slice(MAX_VISIBLE_TABS) };
    }
    const visible = engineList.slice(0, MAX_VISIBLE_TABS - 1);
    const overflow = engineList.slice(MAX_VISIBLE_TABS - 1);
    return { visibleTabs: visible, overflowEngines: overflow };
  }, [engineList, selectedId]);
  const handleSetDefault = (engineId) => {
    onConfigChange({ ...config, defaultEngine: engineId });
  };
  const selectEngine = (id) => {
    setSelectedId(id);
    setShowMore(false);
  };
  return /* @__PURE__ */ jsxs5("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxs5("div", { className: "flex items-end gap-0 overflow-x-auto border-b border-border", children: [
      visibleTabs.map((engine) => {
        const meta = engineMetadatas.find((m) => m.id === engine.id);
        const status = resolveEngineStatus(engine.id, healthStatus, meta);
        const badge = getTabBadge(engine.id, status);
        const stability = getStabilityBadge(meta);
        const isDefault = config.defaultEngine === engine.id;
        const isActive = selectedId === engine.id;
        return /* @__PURE__ */ jsxs5(
          "button",
          {
            type: "button",
            onClick: () => selectEngine(engine.id),
            className: `shrink-0 flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${isActive ? "border-primary text-text-primary" : "border-transparent text-text-tertiary hover:text-text-secondary hover:border-border"}
              `,
            children: [
              t2(engine.nameKey),
              badge && /* @__PURE__ */ jsx5("span", { className: `text-[10px] px-1.5 py-0.5 rounded border ${badge.className}`, children: badge.label }),
              stability && /* @__PURE__ */ jsx5("span", { className: `text-[10px] px-1.5 py-0.5 rounded border ${stability.className}`, children: stability.label }),
              isDefault && /* @__PURE__ */ jsx5("span", { className: "text-[10px] text-primary", children: "\u9ED8\u8BA4" })
            ]
          },
          engine.id
        );
      }),
      overflowEngines.length > 0 && /* @__PURE__ */ jsxs5("div", { ref: moreRef, className: "relative shrink-0", children: [
        /* @__PURE__ */ jsxs5(
          "button",
          {
            type: "button",
            onClick: () => setShowMore((v) => !v),
            className: `flex items-center gap-1 px-3 py-2 text-sm font-medium border-b-2 transition-colors
                ${showMore ? "border-primary text-text-primary" : "border-transparent text-text-tertiary hover:text-text-secondary hover:border-border"}
              `,
            children: [
              "\u66F4\u591A",
              /* @__PURE__ */ jsx5(ChevronDown, { size: 12 })
            ]
          }
        ),
        showMore && /* @__PURE__ */ jsx5("div", { className: "absolute top-full right-0 mt-1 z-popover bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[160px]", children: overflowEngines.map((engine) => {
          const meta = engineMetadatas.find((m) => m.id === engine.id);
          const status = resolveEngineStatus(engine.id, healthStatus, meta);
          const badge = getTabBadge(engine.id, status);
          const stability = getStabilityBadge(meta);
          const isDefault = config.defaultEngine === engine.id;
          return /* @__PURE__ */ jsxs5(
            "button",
            {
              type: "button",
              onClick: () => selectEngine(engine.id),
              className: `w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-background-hover transition-colors
                        ${selectedId === engine.id ? "bg-primary/5 text-text-primary" : "text-text-secondary"}
                      `,
              children: [
                /* @__PURE__ */ jsx5("span", { className: "flex-1 truncate", children: t2(engine.nameKey) }),
                badge && /* @__PURE__ */ jsx5("span", { className: `text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${badge.className}`, children: badge.label }),
                stability && /* @__PURE__ */ jsx5("span", { className: `text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${stability.className}`, children: stability.label }),
                isDefault && /* @__PURE__ */ jsx5("span", { className: "text-[10px] text-primary shrink-0", children: "\u9ED8\u8BA4" })
              ]
            },
            engine.id
          );
        }) })
      ] })
    ] }),
    /* @__PURE__ */ jsx5(
      EngineExpandDetail,
      {
        engineId: selectedId,
        meta: selectedMeta,
        uiConfig: selectedUiConfig,
        status: selectedStatus,
        loading,
        refreshHealth,
        isDefault: config.defaultEngine === selectedId,
        onSetDefault: () => handleSetDefault(selectedId)
      }
    )
  ] });
}

// src/tabs/GeneralTab.tsx
import { useEffect as useEffect3, useState as useState4 } from "react";

// src/tabs/FocusModeSettings.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function FocusModeSettings() {
  const { t: t2 } = useTranslation("settings");
  const {
    level,
    setLevel,
    spotClearRadius,
    setSpotClearRadius,
    spotBlur,
    setSpotBlur,
    dimOpacity,
    setDimOpacity
  } = useFocusModeStore();
  if (!isTauri()) {
    return /* @__PURE__ */ jsxs6("div", { className: "p-4 bg-surface rounded-lg border border-border opacity-60", children: [
      /* @__PURE__ */ jsx6("h3", { className: "text-sm font-medium text-text-primary mb-1", children: t2("focus.title", "\u9605\u8BFB\u805A\u7126\u6A21\u5F0F") }),
      /* @__PURE__ */ jsx6("p", { className: "text-xs text-text-secondary", children: t2("focus.desktopOnly", "\u4EC5\u684C\u9762\u7AEF\u53EF\u7528\uFF1A\u89E6\u5C4F\u8BBE\u5907\u65E0\u9F20\u6807\u60AC\u505C\u8BED\u4E49\u3002") })
    ] });
  }
  const levels = [
    { v: 0, label: t2("focus.off", "\u5173\u95ED"), desc: t2("focus.offDesc", "\u4E0D\u542F\u7528\u805A\u7126") },
    { v: 1, label: t2("focus.l1", "\u8BED\u4E49\u805A\u7126"), desc: t2("focus.l1Desc", "\u60AC\u505C\u6D88\u606F\u5757\u9AD8\u4EAE\uFF0C\u5176\u4F59\u964D\u4EAE\u5EA6") },
    { v: 2, label: t2("focus.l2", "\u805A\u5149\u706F"), desc: t2("focus.l2Desc", "\u53E0\u52A0\u5168\u5C4F\u906E\u7F69\uFF0C\u9F20\u6807\u5904\u6E05\u6670") }
  ];
  return /* @__PURE__ */ jsxs6("div", { className: "p-4 bg-surface rounded-lg border border-border", children: [
    /* @__PURE__ */ jsx6("div", { className: "flex items-center justify-between mb-3", children: /* @__PURE__ */ jsxs6("div", { children: [
      /* @__PURE__ */ jsx6("h3", { className: "text-sm font-medium text-text-primary", children: t2("focus.title", "\u9605\u8BFB\u805A\u7126\u6A21\u5F0F") }),
      /* @__PURE__ */ jsx6("p", { className: "text-xs text-text-secondary mt-0.5", children: t2("focus.hint", "\u51CF\u5C11\u89C6\u89C9\u5E72\u6270\uFF0C\u4E13\u6CE8\u5F53\u524D\u5185\u5BB9\u3002\u5FEB\u6377\u952E Alt+F / Alt+Shift+F") })
    ] }) }),
    /* @__PURE__ */ jsx6("div", { className: "grid grid-cols-3 gap-2 mb-4", children: levels.map((o) => /* @__PURE__ */ jsxs6(
      "button",
      {
        type: "button",
        onClick: () => setLevel(o.v),
        className: `px-3 py-2 text-xs rounded-lg transition-colors text-center ${level === o.v ? "bg-primary text-on-primary" : "bg-background-surface border border-border text-text-secondary hover:text-text-primary"}`,
        children: [
          /* @__PURE__ */ jsx6("div", { className: "font-medium", children: o.label }),
          /* @__PURE__ */ jsx6("div", { className: "text-[10px] opacity-70 mt-0.5", children: o.desc })
        ]
      },
      o.v
    )) }),
    level >= 1 && /* @__PURE__ */ jsx6("div", { className: "space-y-3 pt-3 border-t border-border", children: /* @__PURE__ */ jsxs6("div", { children: [
      /* @__PURE__ */ jsxs6("div", { className: "flex justify-between text-xs text-text-secondary mb-1", children: [
        /* @__PURE__ */ jsx6("span", { children: t2("focus.dimOpacity", "\u5144\u5F1F\u964D\u4EAE\u5EA6") }),
        /* @__PURE__ */ jsxs6("span", { children: [
          Math.round((1 - dimOpacity) * 100),
          "%"
        ] })
      ] }),
      /* @__PURE__ */ jsx6(
        "input",
        {
          type: "range",
          min: 0,
          max: 0.8,
          step: 0.04,
          value: 1 - dimOpacity,
          onChange: (e) => setDimOpacity(1 - Number(e.target.value)),
          className: "w-full accent-primary"
        }
      )
    ] }) }),
    level === 2 && /* @__PURE__ */ jsxs6("div", { className: "space-y-3 pt-3 border-t border-border", children: [
      /* @__PURE__ */ jsxs6("div", { children: [
        /* @__PURE__ */ jsxs6("div", { className: "flex justify-between text-xs text-text-secondary mb-1", children: [
          /* @__PURE__ */ jsx6("span", { children: t2("focus.spotRadius", "\u805A\u5149\u706F\u534A\u5F84") }),
          /* @__PURE__ */ jsxs6("span", { children: [
            spotClearRadius,
            "px"
          ] })
        ] }),
        /* @__PURE__ */ jsx6(
          "input",
          {
            type: "range",
            min: 120,
            max: 400,
            step: 10,
            value: spotClearRadius,
            onChange: (e) => setSpotClearRadius(Number(e.target.value)),
            className: "w-full accent-primary"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs6("div", { children: [
        /* @__PURE__ */ jsxs6("div", { className: "flex justify-between text-xs text-text-secondary mb-1", children: [
          /* @__PURE__ */ jsx6("span", { children: t2("focus.spotBlur", "\u5706\u5916\u6A21\u7CCA\u5F3A\u5EA6") }),
          /* @__PURE__ */ jsx6("span", { children: spotBlur === 0 ? t2("focus.noBlur", "\u4E0D\u6A21\u7CCA") : `${spotBlur}px` })
        ] }),
        /* @__PURE__ */ jsx6(
          "input",
          {
            type: "range",
            min: 0,
            max: 12,
            step: 1,
            value: spotBlur,
            onChange: (e) => setSpotBlur(Number(e.target.value)),
            className: "w-full accent-primary"
          }
        ),
        /* @__PURE__ */ jsx6("p", { className: "text-[10px] text-text-tertiary mt-1", children: t2("focus.spotBlurHint", "\u4F4E\u7AEF\u673A\u6389\u5E27\u65F6\u8BBE\u4E3A 0\uFF08\u4EC5\u964D\u4EAE\u5EA6\u4E0D\u6A21\u7CCA\uFF09") })
      ] })
    ] })
  ] });
}

// src/tabs/SystemPromptSection.tsx
import { useState as useState3 } from "react";

// node_modules/i18next/dist/esm/i18next.js
var isString = (obj) => typeof obj === "string";
var defer = () => {
  let res;
  let rej;
  const promise = new Promise((resolve, reject) => {
    res = resolve;
    rej = reject;
  });
  promise.resolve = res;
  promise.reject = rej;
  return promise;
};
var makeString = (object) => {
  if (object == null) return "";
  return "" + object;
};
var copy = (a, s, t2) => {
  a.forEach((m) => {
    if (s[m]) t2[m] = s[m];
  });
};
var lastOfPathSeparatorRegExp = /###/g;
var cleanKey = (key) => key && key.indexOf("###") > -1 ? key.replace(lastOfPathSeparatorRegExp, ".") : key;
var canNotTraverseDeeper = (object) => !object || isString(object);
var getLastOfPath = (object, path, Empty) => {
  const stack = !isString(path) ? path : path.split(".");
  let stackIndex = 0;
  while (stackIndex < stack.length - 1) {
    if (canNotTraverseDeeper(object)) return {};
    const key = cleanKey(stack[stackIndex]);
    if (!object[key] && Empty) object[key] = new Empty();
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      object = object[key];
    } else {
      object = {};
    }
    ++stackIndex;
  }
  if (canNotTraverseDeeper(object)) return {};
  return {
    obj: object,
    k: cleanKey(stack[stackIndex])
  };
};
var setPath = (object, path, newValue) => {
  const {
    obj,
    k
  } = getLastOfPath(object, path, Object);
  if (obj !== void 0 || path.length === 1) {
    obj[k] = newValue;
    return;
  }
  let e = path[path.length - 1];
  let p = path.slice(0, path.length - 1);
  let last = getLastOfPath(object, p, Object);
  while (last.obj === void 0 && p.length) {
    e = `${p[p.length - 1]}.${e}`;
    p = p.slice(0, p.length - 1);
    last = getLastOfPath(object, p, Object);
    if (last?.obj && typeof last.obj[`${last.k}.${e}`] !== "undefined") {
      last.obj = void 0;
    }
  }
  last.obj[`${last.k}.${e}`] = newValue;
};
var pushPath = (object, path, newValue, concat) => {
  const {
    obj,
    k
  } = getLastOfPath(object, path, Object);
  obj[k] = obj[k] || [];
  obj[k].push(newValue);
};
var getPath = (object, path) => {
  const {
    obj,
    k
  } = getLastOfPath(object, path);
  if (!obj) return void 0;
  if (!Object.prototype.hasOwnProperty.call(obj, k)) return void 0;
  return obj[k];
};
var getPathWithDefaults = (data, defaultData, key) => {
  const value = getPath(data, key);
  if (value !== void 0) {
    return value;
  }
  return getPath(defaultData, key);
};
var deepExtend = (target, source, overwrite) => {
  for (const prop in source) {
    if (prop !== "__proto__" && prop !== "constructor") {
      if (prop in target) {
        if (isString(target[prop]) || target[prop] instanceof String || isString(source[prop]) || source[prop] instanceof String) {
          if (overwrite) target[prop] = source[prop];
        } else {
          deepExtend(target[prop], source[prop], overwrite);
        }
      } else {
        target[prop] = source[prop];
      }
    }
  }
  return target;
};
var regexEscape = (str) => str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
var _entityMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;"
};
var escape = (data) => {
  if (isString(data)) {
    return data.replace(/[&<>"'\/]/g, (s) => _entityMap[s]);
  }
  return data;
};
var RegExpCache = class {
  constructor(capacity) {
    this.capacity = capacity;
    this.regExpMap = /* @__PURE__ */ new Map();
    this.regExpQueue = [];
  }
  getRegExp(pattern) {
    const regExpFromCache = this.regExpMap.get(pattern);
    if (regExpFromCache !== void 0) {
      return regExpFromCache;
    }
    const regExpNew = new RegExp(pattern);
    if (this.regExpQueue.length === this.capacity) {
      this.regExpMap.delete(this.regExpQueue.shift());
    }
    this.regExpMap.set(pattern, regExpNew);
    this.regExpQueue.push(pattern);
    return regExpNew;
  }
};
var chars = [" ", ",", "?", "!", ";"];
var looksLikeObjectPathRegExpCache = new RegExpCache(20);
var looksLikeObjectPath = (key, nsSeparator, keySeparator) => {
  nsSeparator = nsSeparator || "";
  keySeparator = keySeparator || "";
  const possibleChars = chars.filter((c) => nsSeparator.indexOf(c) < 0 && keySeparator.indexOf(c) < 0);
  if (possibleChars.length === 0) return true;
  const r = looksLikeObjectPathRegExpCache.getRegExp(`(${possibleChars.map((c) => c === "?" ? "\\?" : c).join("|")})`);
  let matched = !r.test(key);
  if (!matched) {
    const ki = key.indexOf(keySeparator);
    if (ki > 0 && !r.test(key.substring(0, ki))) {
      matched = true;
    }
  }
  return matched;
};
var deepFind = (obj, path, keySeparator = ".") => {
  if (!obj) return void 0;
  if (obj[path]) {
    if (!Object.prototype.hasOwnProperty.call(obj, path)) return void 0;
    return obj[path];
  }
  const tokens = path.split(keySeparator);
  let current = obj;
  for (let i = 0; i < tokens.length; ) {
    if (!current || typeof current !== "object") {
      return void 0;
    }
    let next;
    let nextPath = "";
    for (let j = i; j < tokens.length; ++j) {
      if (j !== i) {
        nextPath += keySeparator;
      }
      nextPath += tokens[j];
      next = current[nextPath];
      if (next !== void 0) {
        if (["string", "number", "boolean"].indexOf(typeof next) > -1 && j < tokens.length - 1) {
          continue;
        }
        i += j - i + 1;
        break;
      }
    }
    current = next;
  }
  return current;
};
var getCleanedCode = (code) => code?.replace(/_/g, "-");
var consoleLogger = {
  type: "logger",
  log(args) {
    this.output("log", args);
  },
  warn(args) {
    this.output("warn", args);
  },
  error(args) {
    this.output("error", args);
  },
  output(type, args) {
    console?.[type]?.apply?.(console, args);
  }
};
var Logger = class _Logger {
  constructor(concreteLogger, options = {}) {
    this.init(concreteLogger, options);
  }
  init(concreteLogger, options = {}) {
    this.prefix = options.prefix || "i18next:";
    this.logger = concreteLogger || consoleLogger;
    this.options = options;
    this.debug = options.debug;
  }
  log(...args) {
    return this.forward(args, "log", "", true);
  }
  warn(...args) {
    return this.forward(args, "warn", "", true);
  }
  error(...args) {
    return this.forward(args, "error", "");
  }
  deprecate(...args) {
    return this.forward(args, "warn", "WARNING DEPRECATED: ", true);
  }
  forward(args, lvl, prefix, debugOnly) {
    if (debugOnly && !this.debug) return null;
    if (isString(args[0])) args[0] = `${prefix}${this.prefix} ${args[0]}`;
    return this.logger[lvl](args);
  }
  create(moduleName) {
    return new _Logger(this.logger, {
      ...{
        prefix: `${this.prefix}:${moduleName}:`
      },
      ...this.options
    });
  }
  clone(options) {
    options = options || this.options;
    options.prefix = options.prefix || this.prefix;
    return new _Logger(this.logger, options);
  }
};
var baseLogger = new Logger();
var EventEmitter = class {
  constructor() {
    this.observers = {};
  }
  on(events, listener) {
    events.split(" ").forEach((event) => {
      if (!this.observers[event]) this.observers[event] = /* @__PURE__ */ new Map();
      const numListeners = this.observers[event].get(listener) || 0;
      this.observers[event].set(listener, numListeners + 1);
    });
    return this;
  }
  off(event, listener) {
    if (!this.observers[event]) return;
    if (!listener) {
      delete this.observers[event];
      return;
    }
    this.observers[event].delete(listener);
  }
  emit(event, ...args) {
    if (this.observers[event]) {
      const cloned = Array.from(this.observers[event].entries());
      cloned.forEach(([observer, numTimesAdded]) => {
        for (let i = 0; i < numTimesAdded; i++) {
          observer(...args);
        }
      });
    }
    if (this.observers["*"]) {
      const cloned = Array.from(this.observers["*"].entries());
      cloned.forEach(([observer, numTimesAdded]) => {
        for (let i = 0; i < numTimesAdded; i++) {
          observer.apply(observer, [event, ...args]);
        }
      });
    }
  }
};
var ResourceStore = class extends EventEmitter {
  constructor(data, options = {
    ns: ["translation"],
    defaultNS: "translation"
  }) {
    super();
    this.data = data || {};
    this.options = options;
    if (this.options.keySeparator === void 0) {
      this.options.keySeparator = ".";
    }
    if (this.options.ignoreJSONStructure === void 0) {
      this.options.ignoreJSONStructure = true;
    }
  }
  addNamespaces(ns) {
    if (this.options.ns.indexOf(ns) < 0) {
      this.options.ns.push(ns);
    }
  }
  removeNamespaces(ns) {
    const index = this.options.ns.indexOf(ns);
    if (index > -1) {
      this.options.ns.splice(index, 1);
    }
  }
  getResource(lng, ns, key, options = {}) {
    const keySeparator = options.keySeparator !== void 0 ? options.keySeparator : this.options.keySeparator;
    const ignoreJSONStructure = options.ignoreJSONStructure !== void 0 ? options.ignoreJSONStructure : this.options.ignoreJSONStructure;
    let path;
    if (lng.indexOf(".") > -1) {
      path = lng.split(".");
    } else {
      path = [lng, ns];
      if (key) {
        if (Array.isArray(key)) {
          path.push(...key);
        } else if (isString(key) && keySeparator) {
          path.push(...key.split(keySeparator));
        } else {
          path.push(key);
        }
      }
    }
    const result = getPath(this.data, path);
    if (!result && !ns && !key && lng.indexOf(".") > -1) {
      lng = path[0];
      ns = path[1];
      key = path.slice(2).join(".");
    }
    if (result || !ignoreJSONStructure || !isString(key)) return result;
    return deepFind(this.data?.[lng]?.[ns], key, keySeparator);
  }
  addResource(lng, ns, key, value, options = {
    silent: false
  }) {
    const keySeparator = options.keySeparator !== void 0 ? options.keySeparator : this.options.keySeparator;
    let path = [lng, ns];
    if (key) path = path.concat(keySeparator ? key.split(keySeparator) : key);
    if (lng.indexOf(".") > -1) {
      path = lng.split(".");
      value = ns;
      ns = path[1];
    }
    this.addNamespaces(ns);
    setPath(this.data, path, value);
    if (!options.silent) this.emit("added", lng, ns, key, value);
  }
  addResources(lng, ns, resources, options = {
    silent: false
  }) {
    for (const m in resources) {
      if (isString(resources[m]) || Array.isArray(resources[m])) this.addResource(lng, ns, m, resources[m], {
        silent: true
      });
    }
    if (!options.silent) this.emit("added", lng, ns, resources);
  }
  addResourceBundle(lng, ns, resources, deep, overwrite, options = {
    silent: false,
    skipCopy: false
  }) {
    let path = [lng, ns];
    if (lng.indexOf(".") > -1) {
      path = lng.split(".");
      deep = resources;
      resources = ns;
      ns = path[1];
    }
    this.addNamespaces(ns);
    let pack = getPath(this.data, path) || {};
    if (!options.skipCopy) resources = JSON.parse(JSON.stringify(resources));
    if (deep) {
      deepExtend(pack, resources, overwrite);
    } else {
      pack = {
        ...pack,
        ...resources
      };
    }
    setPath(this.data, path, pack);
    if (!options.silent) this.emit("added", lng, ns, resources);
  }
  removeResourceBundle(lng, ns) {
    if (this.hasResourceBundle(lng, ns)) {
      delete this.data[lng][ns];
    }
    this.removeNamespaces(ns);
    this.emit("removed", lng, ns);
  }
  hasResourceBundle(lng, ns) {
    return this.getResource(lng, ns) !== void 0;
  }
  getResourceBundle(lng, ns) {
    if (!ns) ns = this.options.defaultNS;
    return this.getResource(lng, ns);
  }
  getDataByLanguage(lng) {
    return this.data[lng];
  }
  hasLanguageSomeTranslations(lng) {
    const data = this.getDataByLanguage(lng);
    const n = data && Object.keys(data) || [];
    return !!n.find((v) => data[v] && Object.keys(data[v]).length > 0);
  }
  toJSON() {
    return this.data;
  }
};
var postProcessor = {
  processors: {},
  addPostProcessor(module) {
    this.processors[module.name] = module;
  },
  handle(processors, value, key, options, translator) {
    processors.forEach((processor) => {
      value = this.processors[processor]?.process(value, key, options, translator) ?? value;
    });
    return value;
  }
};
var PATH_KEY = Symbol("i18next/PATH_KEY");
function createProxy() {
  const state = [];
  const handler = /* @__PURE__ */ Object.create(null);
  let proxy;
  handler.get = (target, key) => {
    proxy?.revoke?.();
    if (key === PATH_KEY) return state;
    state.push(key);
    proxy = Proxy.revocable(target, handler);
    return proxy.proxy;
  };
  return Proxy.revocable(/* @__PURE__ */ Object.create(null), handler).proxy;
}
function keysFromSelector(selector, opts) {
  const {
    [PATH_KEY]: path
  } = selector(createProxy());
  const keySeparator = opts?.keySeparator ?? ".";
  const nsSeparator = opts?.nsSeparator ?? ":";
  if (path.length > 1 && nsSeparator) {
    const ns = opts?.ns;
    const nsArray = Array.isArray(ns) ? ns : null;
    if (nsArray && nsArray.length > 1 && nsArray.slice(1).includes(path[0])) {
      return `${path[0]}${nsSeparator}${path.slice(1).join(keySeparator)}`;
    }
  }
  return path.join(keySeparator);
}
var checkedLoadedFor = {};
var shouldHandleAsObject = (res) => !isString(res) && typeof res !== "boolean" && typeof res !== "number";
var Translator = class _Translator extends EventEmitter {
  constructor(services, options = {}) {
    super();
    copy(["resourceStore", "languageUtils", "pluralResolver", "interpolator", "backendConnector", "i18nFormat", "utils"], services, this);
    this.options = options;
    if (this.options.keySeparator === void 0) {
      this.options.keySeparator = ".";
    }
    this.logger = baseLogger.create("translator");
  }
  changeLanguage(lng) {
    if (lng) this.language = lng;
  }
  exists(key, o = {
    interpolation: {}
  }) {
    const opt = {
      ...o
    };
    if (key == null) return false;
    const resolved = this.resolve(key, opt);
    if (resolved?.res === void 0) return false;
    const isObject = shouldHandleAsObject(resolved.res);
    if (opt.returnObjects === false && isObject) {
      return false;
    }
    return true;
  }
  extractFromKey(key, opt) {
    let nsSeparator = opt.nsSeparator !== void 0 ? opt.nsSeparator : this.options.nsSeparator;
    if (nsSeparator === void 0) nsSeparator = ":";
    const keySeparator = opt.keySeparator !== void 0 ? opt.keySeparator : this.options.keySeparator;
    let namespaces = opt.ns || this.options.defaultNS || [];
    const wouldCheckForNsInKey = nsSeparator && key.indexOf(nsSeparator) > -1;
    const seemsNaturalLanguage = !this.options.userDefinedKeySeparator && !opt.keySeparator && !this.options.userDefinedNsSeparator && !opt.nsSeparator && !looksLikeObjectPath(key, nsSeparator, keySeparator);
    if (wouldCheckForNsInKey && !seemsNaturalLanguage) {
      const m = key.match(this.interpolator.nestingRegexp);
      if (m && m.length > 0) {
        return {
          key,
          namespaces: isString(namespaces) ? [namespaces] : namespaces
        };
      }
      const parts = key.split(nsSeparator);
      if (nsSeparator !== keySeparator || nsSeparator === keySeparator && this.options.ns.indexOf(parts[0]) > -1) namespaces = parts.shift();
      key = parts.join(keySeparator);
    }
    return {
      key,
      namespaces: isString(namespaces) ? [namespaces] : namespaces
    };
  }
  translate(keys, o, lastKey) {
    let opt = typeof o === "object" ? {
      ...o
    } : o;
    if (typeof opt !== "object" && this.options.overloadTranslationOptionHandler) {
      opt = this.options.overloadTranslationOptionHandler(arguments);
    }
    if (typeof opt === "object") opt = {
      ...opt
    };
    if (!opt) opt = {};
    if (keys == null) return "";
    if (typeof keys === "function") keys = keysFromSelector(keys, {
      ...this.options,
      ...opt
    });
    if (!Array.isArray(keys)) keys = [String(keys)];
    keys = keys.map((k) => typeof k === "function" ? keysFromSelector(k, {
      ...this.options,
      ...opt
    }) : String(k));
    const returnDetails = opt.returnDetails !== void 0 ? opt.returnDetails : this.options.returnDetails;
    const keySeparator = opt.keySeparator !== void 0 ? opt.keySeparator : this.options.keySeparator;
    const {
      key,
      namespaces
    } = this.extractFromKey(keys[keys.length - 1], opt);
    const namespace = namespaces[namespaces.length - 1];
    let nsSeparator = opt.nsSeparator !== void 0 ? opt.nsSeparator : this.options.nsSeparator;
    if (nsSeparator === void 0) nsSeparator = ":";
    const lng = opt.lng || this.language;
    const appendNamespaceToCIMode = opt.appendNamespaceToCIMode || this.options.appendNamespaceToCIMode;
    if (lng?.toLowerCase() === "cimode") {
      if (appendNamespaceToCIMode) {
        if (returnDetails) {
          return {
            res: `${namespace}${nsSeparator}${key}`,
            usedKey: key,
            exactUsedKey: key,
            usedLng: lng,
            usedNS: namespace,
            usedParams: this.getUsedParamsDetails(opt)
          };
        }
        return `${namespace}${nsSeparator}${key}`;
      }
      if (returnDetails) {
        return {
          res: key,
          usedKey: key,
          exactUsedKey: key,
          usedLng: lng,
          usedNS: namespace,
          usedParams: this.getUsedParamsDetails(opt)
        };
      }
      return key;
    }
    const resolved = this.resolve(keys, opt);
    let res = resolved?.res;
    const resUsedKey = resolved?.usedKey || key;
    const resExactUsedKey = resolved?.exactUsedKey || key;
    const noObject = ["[object Number]", "[object Function]", "[object RegExp]"];
    const joinArrays = opt.joinArrays !== void 0 ? opt.joinArrays : this.options.joinArrays;
    const handleAsObjectInI18nFormat = !this.i18nFormat || this.i18nFormat.handleAsObject;
    const needsPluralHandling = opt.count !== void 0 && !isString(opt.count);
    const hasDefaultValue = _Translator.hasDefaultValue(opt);
    const defaultValueSuffix = needsPluralHandling ? this.pluralResolver.getSuffix(lng, opt.count, opt) : "";
    const defaultValueSuffixOrdinalFallback = opt.ordinal && needsPluralHandling ? this.pluralResolver.getSuffix(lng, opt.count, {
      ordinal: false
    }) : "";
    const needsZeroSuffixLookup = needsPluralHandling && !opt.ordinal && opt.count === 0;
    const defaultValue = needsZeroSuffixLookup && opt[`defaultValue${this.options.pluralSeparator}zero`] || opt[`defaultValue${defaultValueSuffix}`] || opt[`defaultValue${defaultValueSuffixOrdinalFallback}`] || opt.defaultValue;
    let resForObjHndl = res;
    if (handleAsObjectInI18nFormat && !res && hasDefaultValue) {
      resForObjHndl = defaultValue;
    }
    const handleAsObject = shouldHandleAsObject(resForObjHndl);
    const resType = Object.prototype.toString.apply(resForObjHndl);
    if (handleAsObjectInI18nFormat && resForObjHndl && handleAsObject && noObject.indexOf(resType) < 0 && !(isString(joinArrays) && Array.isArray(resForObjHndl))) {
      if (!opt.returnObjects && !this.options.returnObjects) {
        if (!this.options.returnedObjectHandler) {
          this.logger.warn("accessing an object - but returnObjects options is not enabled!");
        }
        const r = this.options.returnedObjectHandler ? this.options.returnedObjectHandler(resUsedKey, resForObjHndl, {
          ...opt,
          ns: namespaces
        }) : `key '${key} (${this.language})' returned an object instead of string.`;
        if (returnDetails) {
          resolved.res = r;
          resolved.usedParams = this.getUsedParamsDetails(opt);
          return resolved;
        }
        return r;
      }
      if (keySeparator) {
        const resTypeIsArray = Array.isArray(resForObjHndl);
        const copy2 = resTypeIsArray ? [] : {};
        const newKeyToUse = resTypeIsArray ? resExactUsedKey : resUsedKey;
        for (const m in resForObjHndl) {
          if (Object.prototype.hasOwnProperty.call(resForObjHndl, m)) {
            const deepKey = `${newKeyToUse}${keySeparator}${m}`;
            if (hasDefaultValue && !res) {
              copy2[m] = this.translate(deepKey, {
                ...opt,
                defaultValue: shouldHandleAsObject(defaultValue) ? defaultValue[m] : void 0,
                ...{
                  joinArrays: false,
                  ns: namespaces
                }
              });
            } else {
              copy2[m] = this.translate(deepKey, {
                ...opt,
                ...{
                  joinArrays: false,
                  ns: namespaces
                }
              });
            }
            if (copy2[m] === deepKey) copy2[m] = resForObjHndl[m];
          }
        }
        res = copy2;
      }
    } else if (handleAsObjectInI18nFormat && isString(joinArrays) && Array.isArray(res)) {
      res = res.join(joinArrays);
      if (res) res = this.extendTranslation(res, keys, opt, lastKey);
    } else {
      let usedDefault = false;
      let usedKey = false;
      if (!this.isValidLookup(res) && hasDefaultValue) {
        usedDefault = true;
        res = defaultValue;
      }
      if (!this.isValidLookup(res)) {
        usedKey = true;
        res = key;
      }
      const missingKeyNoValueFallbackToKey = opt.missingKeyNoValueFallbackToKey || this.options.missingKeyNoValueFallbackToKey;
      const resForMissing = missingKeyNoValueFallbackToKey && usedKey ? void 0 : res;
      const updateMissing = hasDefaultValue && defaultValue !== res && this.options.updateMissing;
      if (usedKey || usedDefault || updateMissing) {
        this.logger.log(updateMissing ? "updateKey" : "missingKey", lng, namespace, key, updateMissing ? defaultValue : res);
        if (keySeparator) {
          const fk = this.resolve(key, {
            ...opt,
            keySeparator: false
          });
          if (fk && fk.res) this.logger.warn("Seems the loaded translations were in flat JSON format instead of nested. Either set keySeparator: false on init or make sure your translations are published in nested format.");
        }
        let lngs = [];
        const fallbackLngs = this.languageUtils.getFallbackCodes(this.options.fallbackLng, opt.lng || this.language);
        if (this.options.saveMissingTo === "fallback" && fallbackLngs && fallbackLngs[0]) {
          for (let i = 0; i < fallbackLngs.length; i++) {
            lngs.push(fallbackLngs[i]);
          }
        } else if (this.options.saveMissingTo === "all") {
          lngs = this.languageUtils.toResolveHierarchy(opt.lng || this.language);
        } else {
          lngs.push(opt.lng || this.language);
        }
        const send = (l, k, specificDefaultValue) => {
          const defaultForMissing = hasDefaultValue && specificDefaultValue !== res ? specificDefaultValue : resForMissing;
          if (this.options.missingKeyHandler) {
            this.options.missingKeyHandler(l, namespace, k, defaultForMissing, updateMissing, opt);
          } else if (this.backendConnector?.saveMissing) {
            this.backendConnector.saveMissing(l, namespace, k, defaultForMissing, updateMissing, opt);
          }
          this.emit("missingKey", l, namespace, k, res);
        };
        if (this.options.saveMissing) {
          if (this.options.saveMissingPlurals && needsPluralHandling) {
            lngs.forEach((language) => {
              const suffixes = this.pluralResolver.getSuffixes(language, opt);
              if (needsZeroSuffixLookup && opt[`defaultValue${this.options.pluralSeparator}zero`] && suffixes.indexOf(`${this.options.pluralSeparator}zero`) < 0) {
                suffixes.push(`${this.options.pluralSeparator}zero`);
              }
              suffixes.forEach((suffix) => {
                send([language], key + suffix, opt[`defaultValue${suffix}`] || defaultValue);
              });
            });
          } else {
            send(lngs, key, defaultValue);
          }
        }
      }
      res = this.extendTranslation(res, keys, opt, resolved, lastKey);
      if (usedKey && res === key && this.options.appendNamespaceToMissingKey) {
        res = `${namespace}${nsSeparator}${key}`;
      }
      if ((usedKey || usedDefault) && this.options.parseMissingKeyHandler) {
        res = this.options.parseMissingKeyHandler(this.options.appendNamespaceToMissingKey ? `${namespace}${nsSeparator}${key}` : key, usedDefault ? res : void 0, opt);
      }
    }
    if (returnDetails) {
      resolved.res = res;
      resolved.usedParams = this.getUsedParamsDetails(opt);
      return resolved;
    }
    return res;
  }
  extendTranslation(res, key, opt, resolved, lastKey) {
    if (this.i18nFormat?.parse) {
      res = this.i18nFormat.parse(res, {
        ...this.options.interpolation.defaultVariables,
        ...opt
      }, opt.lng || this.language || resolved.usedLng, resolved.usedNS, resolved.usedKey, {
        resolved
      });
    } else if (!opt.skipInterpolation) {
      if (opt.interpolation) this.interpolator.init({
        ...opt,
        ...{
          interpolation: {
            ...this.options.interpolation,
            ...opt.interpolation
          }
        }
      });
      const skipOnVariables = isString(res) && (opt?.interpolation?.skipOnVariables !== void 0 ? opt.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables);
      let nestBef;
      if (skipOnVariables) {
        const nb = res.match(this.interpolator.nestingRegexp);
        nestBef = nb && nb.length;
      }
      let data = opt.replace && !isString(opt.replace) ? opt.replace : opt;
      if (this.options.interpolation.defaultVariables) data = {
        ...this.options.interpolation.defaultVariables,
        ...data
      };
      res = this.interpolator.interpolate(res, data, opt.lng || this.language || resolved.usedLng, opt);
      if (skipOnVariables) {
        const na = res.match(this.interpolator.nestingRegexp);
        const nestAft = na && na.length;
        if (nestBef < nestAft) opt.nest = false;
      }
      if (!opt.lng && resolved && resolved.res) opt.lng = this.language || resolved.usedLng;
      if (opt.nest !== false) res = this.interpolator.nest(res, (...args) => {
        if (lastKey?.[0] === args[0] && !opt.context) {
          this.logger.warn(`It seems you are nesting recursively key: ${args[0]} in key: ${key[0]}`);
          return null;
        }
        return this.translate(...args, key);
      }, opt);
      if (opt.interpolation) this.interpolator.reset();
    }
    const postProcess = opt.postProcess || this.options.postProcess;
    const postProcessorNames = isString(postProcess) ? [postProcess] : postProcess;
    if (res != null && postProcessorNames?.length && opt.applyPostProcessor !== false) {
      res = postProcessor.handle(postProcessorNames, res, key, this.options && this.options.postProcessPassResolved ? {
        i18nResolved: {
          ...resolved,
          usedParams: this.getUsedParamsDetails(opt)
        },
        ...opt
      } : opt, this);
    }
    return res;
  }
  resolve(keys, opt = {}) {
    let found;
    let usedKey;
    let exactUsedKey;
    let usedLng;
    let usedNS;
    if (isString(keys)) keys = [keys];
    if (Array.isArray(keys)) keys = keys.map((k) => typeof k === "function" ? keysFromSelector(k, {
      ...this.options,
      ...opt
    }) : k);
    keys.forEach((k) => {
      if (this.isValidLookup(found)) return;
      const extracted = this.extractFromKey(k, opt);
      const key = extracted.key;
      usedKey = key;
      let namespaces = extracted.namespaces;
      if (this.options.fallbackNS) namespaces = namespaces.concat(this.options.fallbackNS);
      const needsPluralHandling = opt.count !== void 0 && !isString(opt.count);
      const needsZeroSuffixLookup = needsPluralHandling && !opt.ordinal && opt.count === 0;
      const needsContextHandling = opt.context !== void 0 && (isString(opt.context) || typeof opt.context === "number") && opt.context !== "";
      const codes = opt.lngs ? opt.lngs : this.languageUtils.toResolveHierarchy(opt.lng || this.language, opt.fallbackLng);
      namespaces.forEach((ns) => {
        if (this.isValidLookup(found)) return;
        usedNS = ns;
        if (!checkedLoadedFor[`${codes[0]}-${ns}`] && this.utils?.hasLoadedNamespace && !this.utils?.hasLoadedNamespace(usedNS)) {
          checkedLoadedFor[`${codes[0]}-${ns}`] = true;
          this.logger.warn(`key "${usedKey}" for languages "${codes.join(", ")}" won't get resolved as namespace "${usedNS}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!");
        }
        codes.forEach((code) => {
          if (this.isValidLookup(found)) return;
          usedLng = code;
          const finalKeys = [key];
          if (this.i18nFormat?.addLookupKeys) {
            this.i18nFormat.addLookupKeys(finalKeys, key, code, ns, opt);
          } else {
            let pluralSuffix;
            if (needsPluralHandling) pluralSuffix = this.pluralResolver.getSuffix(code, opt.count, opt);
            const zeroSuffix = `${this.options.pluralSeparator}zero`;
            const ordinalPrefix = `${this.options.pluralSeparator}ordinal${this.options.pluralSeparator}`;
            if (needsPluralHandling) {
              if (opt.ordinal && pluralSuffix.indexOf(ordinalPrefix) === 0) {
                finalKeys.push(key + pluralSuffix.replace(ordinalPrefix, this.options.pluralSeparator));
              }
              finalKeys.push(key + pluralSuffix);
              if (needsZeroSuffixLookup) {
                finalKeys.push(key + zeroSuffix);
              }
            }
            if (needsContextHandling) {
              const contextKey = `${key}${this.options.contextSeparator || "_"}${opt.context}`;
              finalKeys.push(contextKey);
              if (needsPluralHandling) {
                if (opt.ordinal && pluralSuffix.indexOf(ordinalPrefix) === 0) {
                  finalKeys.push(contextKey + pluralSuffix.replace(ordinalPrefix, this.options.pluralSeparator));
                }
                finalKeys.push(contextKey + pluralSuffix);
                if (needsZeroSuffixLookup) {
                  finalKeys.push(contextKey + zeroSuffix);
                }
              }
            }
          }
          let possibleKey;
          while (possibleKey = finalKeys.pop()) {
            if (!this.isValidLookup(found)) {
              exactUsedKey = possibleKey;
              found = this.getResource(code, ns, possibleKey, opt);
            }
          }
        });
      });
    });
    return {
      res: found,
      usedKey,
      exactUsedKey,
      usedLng,
      usedNS
    };
  }
  isValidLookup(res) {
    return res !== void 0 && !(!this.options.returnNull && res === null) && !(!this.options.returnEmptyString && res === "");
  }
  getResource(code, ns, key, options = {}) {
    if (this.i18nFormat?.getResource) return this.i18nFormat.getResource(code, ns, key, options);
    return this.resourceStore.getResource(code, ns, key, options);
  }
  getUsedParamsDetails(options = {}) {
    const optionsKeys = ["defaultValue", "ordinal", "context", "replace", "lng", "lngs", "fallbackLng", "ns", "keySeparator", "nsSeparator", "returnObjects", "returnDetails", "joinArrays", "postProcess", "interpolation"];
    const useOptionsReplaceForData = options.replace && !isString(options.replace);
    let data = useOptionsReplaceForData ? options.replace : options;
    if (useOptionsReplaceForData && typeof options.count !== "undefined") {
      data.count = options.count;
    }
    if (this.options.interpolation.defaultVariables) {
      data = {
        ...this.options.interpolation.defaultVariables,
        ...data
      };
    }
    if (!useOptionsReplaceForData) {
      data = {
        ...data
      };
      for (const key of optionsKeys) {
        delete data[key];
      }
    }
    return data;
  }
  static hasDefaultValue(options) {
    const prefix = "defaultValue";
    for (const option in options) {
      if (Object.prototype.hasOwnProperty.call(options, option) && prefix === option.substring(0, prefix.length) && void 0 !== options[option]) {
        return true;
      }
    }
    return false;
  }
};
var LanguageUtil = class {
  constructor(options) {
    this.options = options;
    this.supportedLngs = this.options.supportedLngs || false;
    this.logger = baseLogger.create("languageUtils");
  }
  getScriptPartFromCode(code) {
    code = getCleanedCode(code);
    if (!code || code.indexOf("-") < 0) return null;
    const p = code.split("-");
    if (p.length === 2) return null;
    p.pop();
    if (p[p.length - 1].toLowerCase() === "x") return null;
    return this.formatLanguageCode(p.join("-"));
  }
  getLanguagePartFromCode(code) {
    code = getCleanedCode(code);
    if (!code || code.indexOf("-") < 0) return code;
    const p = code.split("-");
    return this.formatLanguageCode(p[0]);
  }
  formatLanguageCode(code) {
    if (isString(code) && code.indexOf("-") > -1) {
      let formattedCode;
      try {
        formattedCode = Intl.getCanonicalLocales(code)[0];
      } catch (e) {
      }
      if (formattedCode && this.options.lowerCaseLng) {
        formattedCode = formattedCode.toLowerCase();
      }
      if (formattedCode) return formattedCode;
      if (this.options.lowerCaseLng) {
        return code.toLowerCase();
      }
      return code;
    }
    return this.options.cleanCode || this.options.lowerCaseLng ? code.toLowerCase() : code;
  }
  isSupportedCode(code) {
    if (this.options.load === "languageOnly" || this.options.nonExplicitSupportedLngs) {
      code = this.getLanguagePartFromCode(code);
    }
    return !this.supportedLngs || !this.supportedLngs.length || this.supportedLngs.indexOf(code) > -1;
  }
  getBestMatchFromCodes(codes) {
    if (!codes) return null;
    let found;
    codes.forEach((code) => {
      if (found) return;
      const cleanedLng = this.formatLanguageCode(code);
      if (!this.options.supportedLngs || this.isSupportedCode(cleanedLng)) found = cleanedLng;
    });
    if (!found && this.options.supportedLngs) {
      codes.forEach((code) => {
        if (found) return;
        const lngScOnly = this.getScriptPartFromCode(code);
        if (this.isSupportedCode(lngScOnly)) return found = lngScOnly;
        const lngOnly = this.getLanguagePartFromCode(code);
        if (this.isSupportedCode(lngOnly)) return found = lngOnly;
        found = this.options.supportedLngs.find((supportedLng) => {
          if (supportedLng === lngOnly) return supportedLng;
          if (supportedLng.indexOf("-") < 0 && lngOnly.indexOf("-") < 0) return;
          if (supportedLng.indexOf("-") > 0 && lngOnly.indexOf("-") < 0 && supportedLng.substring(0, supportedLng.indexOf("-")) === lngOnly) return supportedLng;
          if (supportedLng.indexOf(lngOnly) === 0 && lngOnly.length > 1) return supportedLng;
        });
      });
    }
    if (!found) found = this.getFallbackCodes(this.options.fallbackLng)[0];
    return found;
  }
  getFallbackCodes(fallbacks, code) {
    if (!fallbacks) return [];
    if (typeof fallbacks === "function") fallbacks = fallbacks(code);
    if (isString(fallbacks)) fallbacks = [fallbacks];
    if (Array.isArray(fallbacks)) return fallbacks;
    if (!code) return fallbacks.default || [];
    let found = fallbacks[code];
    if (!found) found = fallbacks[this.getScriptPartFromCode(code)];
    if (!found) found = fallbacks[this.formatLanguageCode(code)];
    if (!found) found = fallbacks[this.getLanguagePartFromCode(code)];
    if (!found) found = fallbacks.default;
    return found || [];
  }
  toResolveHierarchy(code, fallbackCode) {
    const fallbackCodes = this.getFallbackCodes((fallbackCode === false ? [] : fallbackCode) || this.options.fallbackLng || [], code);
    const codes = [];
    const addCode = (c) => {
      if (!c) return;
      if (this.isSupportedCode(c)) {
        codes.push(c);
      } else {
        this.logger.warn(`rejecting language code not found in supportedLngs: ${c}`);
      }
    };
    if (isString(code) && (code.indexOf("-") > -1 || code.indexOf("_") > -1)) {
      if (this.options.load !== "languageOnly") addCode(this.formatLanguageCode(code));
      if (this.options.load !== "languageOnly" && this.options.load !== "currentOnly") addCode(this.getScriptPartFromCode(code));
      if (this.options.load !== "currentOnly") addCode(this.getLanguagePartFromCode(code));
    } else if (isString(code)) {
      addCode(this.formatLanguageCode(code));
    }
    fallbackCodes.forEach((fc) => {
      if (codes.indexOf(fc) < 0) addCode(this.formatLanguageCode(fc));
    });
    return codes;
  }
};
var suffixesOrder = {
  zero: 0,
  one: 1,
  two: 2,
  few: 3,
  many: 4,
  other: 5
};
var dummyRule = {
  select: (count) => count === 1 ? "one" : "other",
  resolvedOptions: () => ({
    pluralCategories: ["one", "other"]
  })
};
var PluralResolver = class {
  constructor(languageUtils, options = {}) {
    this.languageUtils = languageUtils;
    this.options = options;
    this.logger = baseLogger.create("pluralResolver");
    this.pluralRulesCache = {};
  }
  clearCache() {
    this.pluralRulesCache = {};
  }
  getRule(code, options = {}) {
    const cleanedCode = getCleanedCode(code === "dev" ? "en" : code);
    const type = options.ordinal ? "ordinal" : "cardinal";
    const cacheKey = JSON.stringify({
      cleanedCode,
      type
    });
    if (cacheKey in this.pluralRulesCache) {
      return this.pluralRulesCache[cacheKey];
    }
    let rule;
    try {
      rule = new Intl.PluralRules(cleanedCode, {
        type
      });
    } catch (err) {
      if (typeof Intl === "undefined") {
        this.logger.error("No Intl support, please use an Intl polyfill!");
        return dummyRule;
      }
      if (!code.match(/-|_/)) return dummyRule;
      const lngPart = this.languageUtils.getLanguagePartFromCode(code);
      rule = this.getRule(lngPart, options);
    }
    this.pluralRulesCache[cacheKey] = rule;
    return rule;
  }
  needsPlural(code, options = {}) {
    let rule = this.getRule(code, options);
    if (!rule) rule = this.getRule("dev", options);
    return rule?.resolvedOptions().pluralCategories.length > 1;
  }
  getPluralFormsOfKey(code, key, options = {}) {
    return this.getSuffixes(code, options).map((suffix) => `${key}${suffix}`);
  }
  getSuffixes(code, options = {}) {
    let rule = this.getRule(code, options);
    if (!rule) rule = this.getRule("dev", options);
    if (!rule) return [];
    return rule.resolvedOptions().pluralCategories.sort((pluralCategory1, pluralCategory2) => suffixesOrder[pluralCategory1] - suffixesOrder[pluralCategory2]).map((pluralCategory) => `${this.options.prepend}${options.ordinal ? `ordinal${this.options.prepend}` : ""}${pluralCategory}`);
  }
  getSuffix(code, count, options = {}) {
    const rule = this.getRule(code, options);
    if (rule) {
      return `${this.options.prepend}${options.ordinal ? `ordinal${this.options.prepend}` : ""}${rule.select(count)}`;
    }
    this.logger.warn(`no plural rule found for: ${code}`);
    return this.getSuffix("dev", count, options);
  }
};
var deepFindWithDefaults = (data, defaultData, key, keySeparator = ".", ignoreJSONStructure = true) => {
  let path = getPathWithDefaults(data, defaultData, key);
  if (!path && ignoreJSONStructure && isString(key)) {
    path = deepFind(data, key, keySeparator);
    if (path === void 0) path = deepFind(defaultData, key, keySeparator);
  }
  return path;
};
var regexSafe = (val) => val.replace(/\$/g, "$$$$");
var Interpolator = class {
  constructor(options = {}) {
    this.logger = baseLogger.create("interpolator");
    this.options = options;
    this.format = options?.interpolation?.format || ((value) => value);
    this.init(options);
  }
  init(options = {}) {
    if (!options.interpolation) options.interpolation = {
      escapeValue: true
    };
    const {
      escape: escape$1,
      escapeValue,
      useRawValueToEscape,
      prefix,
      prefixEscaped,
      suffix,
      suffixEscaped,
      formatSeparator,
      unescapeSuffix,
      unescapePrefix,
      nestingPrefix,
      nestingPrefixEscaped,
      nestingSuffix,
      nestingSuffixEscaped,
      nestingOptionsSeparator,
      maxReplaces,
      alwaysFormat
    } = options.interpolation;
    this.escape = escape$1 !== void 0 ? escape$1 : escape;
    this.escapeValue = escapeValue !== void 0 ? escapeValue : true;
    this.useRawValueToEscape = useRawValueToEscape !== void 0 ? useRawValueToEscape : false;
    this.prefix = prefix ? regexEscape(prefix) : prefixEscaped || "{{";
    this.suffix = suffix ? regexEscape(suffix) : suffixEscaped || "}}";
    this.formatSeparator = formatSeparator || ",";
    this.unescapePrefix = unescapeSuffix ? "" : unescapePrefix || "-";
    this.unescapeSuffix = this.unescapePrefix ? "" : unescapeSuffix || "";
    this.nestingPrefix = nestingPrefix ? regexEscape(nestingPrefix) : nestingPrefixEscaped || regexEscape("$t(");
    this.nestingSuffix = nestingSuffix ? regexEscape(nestingSuffix) : nestingSuffixEscaped || regexEscape(")");
    this.nestingOptionsSeparator = nestingOptionsSeparator || ",";
    this.maxReplaces = maxReplaces || 1e3;
    this.alwaysFormat = alwaysFormat !== void 0 ? alwaysFormat : false;
    this.resetRegExp();
  }
  reset() {
    if (this.options) this.init(this.options);
  }
  resetRegExp() {
    const getOrResetRegExp = (existingRegExp, pattern) => {
      if (existingRegExp?.source === pattern) {
        existingRegExp.lastIndex = 0;
        return existingRegExp;
      }
      return new RegExp(pattern, "g");
    };
    this.regexp = getOrResetRegExp(this.regexp, `${this.prefix}(.+?)${this.suffix}`);
    this.regexpUnescape = getOrResetRegExp(this.regexpUnescape, `${this.prefix}${this.unescapePrefix}(.+?)${this.unescapeSuffix}${this.suffix}`);
    this.nestingRegexp = getOrResetRegExp(this.nestingRegexp, `${this.nestingPrefix}((?:[^()"']+|"[^"]*"|'[^']*'|\\((?:[^()]|"[^"]*"|'[^']*')*\\))*?)${this.nestingSuffix}`);
  }
  interpolate(str, data, lng, options) {
    let match;
    let value;
    let replaces;
    const defaultData = this.options && this.options.interpolation && this.options.interpolation.defaultVariables || {};
    const handleFormat = (key) => {
      if (key.indexOf(this.formatSeparator) < 0) {
        const path = deepFindWithDefaults(data, defaultData, key, this.options.keySeparator, this.options.ignoreJSONStructure);
        return this.alwaysFormat ? this.format(path, void 0, lng, {
          ...options,
          ...data,
          interpolationkey: key
        }) : path;
      }
      const p = key.split(this.formatSeparator);
      const k = p.shift().trim();
      const f = p.join(this.formatSeparator).trim();
      return this.format(deepFindWithDefaults(data, defaultData, k, this.options.keySeparator, this.options.ignoreJSONStructure), f, lng, {
        ...options,
        ...data,
        interpolationkey: k
      });
    };
    this.resetRegExp();
    const missingInterpolationHandler = options?.missingInterpolationHandler || this.options.missingInterpolationHandler;
    const skipOnVariables = options?.interpolation?.skipOnVariables !== void 0 ? options.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables;
    const todos = [{
      regex: this.regexpUnescape,
      safeValue: (val) => regexSafe(val)
    }, {
      regex: this.regexp,
      safeValue: (val) => this.escapeValue ? regexSafe(this.escape(val)) : regexSafe(val)
    }];
    todos.forEach((todo) => {
      replaces = 0;
      while (match = todo.regex.exec(str)) {
        const matchedVar = match[1].trim();
        value = handleFormat(matchedVar);
        if (value === void 0) {
          if (typeof missingInterpolationHandler === "function") {
            const temp = missingInterpolationHandler(str, match, options);
            value = isString(temp) ? temp : "";
          } else if (options && Object.prototype.hasOwnProperty.call(options, matchedVar)) {
            value = "";
          } else if (skipOnVariables) {
            value = match[0];
            continue;
          } else {
            this.logger.warn(`missed to pass in variable ${matchedVar} for interpolating ${str}`);
            value = "";
          }
        } else if (!isString(value) && !this.useRawValueToEscape) {
          value = makeString(value);
        }
        const safeValue = todo.safeValue(value);
        str = str.replace(match[0], safeValue);
        if (skipOnVariables) {
          todo.regex.lastIndex += value.length;
          todo.regex.lastIndex -= match[0].length;
        } else {
          todo.regex.lastIndex = 0;
        }
        replaces++;
        if (replaces >= this.maxReplaces) {
          break;
        }
      }
    });
    return str;
  }
  nest(str, fc, options = {}) {
    let match;
    let value;
    let clonedOptions;
    const handleHasOptions = (key, inheritedOptions) => {
      const sep = this.nestingOptionsSeparator;
      if (key.indexOf(sep) < 0) return key;
      const c = key.split(new RegExp(`${regexEscape(sep)}[ ]*{`));
      let optionsString = `{${c[1]}`;
      key = c[0];
      optionsString = this.interpolate(optionsString, clonedOptions);
      const matchedSingleQuotes = optionsString.match(/'/g);
      const matchedDoubleQuotes = optionsString.match(/"/g);
      if ((matchedSingleQuotes?.length ?? 0) % 2 === 0 && !matchedDoubleQuotes || (matchedDoubleQuotes?.length ?? 0) % 2 !== 0) {
        optionsString = optionsString.replace(/'/g, '"');
      }
      try {
        clonedOptions = JSON.parse(optionsString);
        if (inheritedOptions) clonedOptions = {
          ...inheritedOptions,
          ...clonedOptions
        };
      } catch (e) {
        this.logger.warn(`failed parsing options string in nesting for key ${key}`, e);
        return `${key}${sep}${optionsString}`;
      }
      if (clonedOptions.defaultValue && clonedOptions.defaultValue.indexOf(this.prefix) > -1) delete clonedOptions.defaultValue;
      return key;
    };
    while (match = this.nestingRegexp.exec(str)) {
      let formatters = [];
      clonedOptions = {
        ...options
      };
      clonedOptions = clonedOptions.replace && !isString(clonedOptions.replace) ? clonedOptions.replace : clonedOptions;
      clonedOptions.applyPostProcessor = false;
      delete clonedOptions.defaultValue;
      const keyEndIndex = /{.*}/.test(match[1]) ? match[1].lastIndexOf("}") + 1 : match[1].indexOf(this.formatSeparator);
      if (keyEndIndex !== -1) {
        formatters = match[1].slice(keyEndIndex).split(this.formatSeparator).map((elem) => elem.trim()).filter(Boolean);
        match[1] = match[1].slice(0, keyEndIndex);
      }
      value = fc(handleHasOptions.call(this, match[1].trim(), clonedOptions), clonedOptions);
      if (value && match[0] === str && !isString(value)) return value;
      if (!isString(value)) value = makeString(value);
      if (!value) {
        this.logger.warn(`missed to resolve ${match[1]} for nesting ${str}`);
        value = "";
      }
      if (formatters.length) {
        value = formatters.reduce((v, f) => this.format(v, f, options.lng, {
          ...options,
          interpolationkey: match[1].trim()
        }), value.trim());
      }
      str = str.replace(match[0], value);
      this.regexp.lastIndex = 0;
    }
    return str;
  }
};
var parseFormatStr = (formatStr) => {
  let formatName = formatStr.toLowerCase().trim();
  const formatOptions = {};
  if (formatStr.indexOf("(") > -1) {
    const p = formatStr.split("(");
    formatName = p[0].toLowerCase().trim();
    const optStr = p[1].substring(0, p[1].length - 1);
    if (formatName === "currency" && optStr.indexOf(":") < 0) {
      if (!formatOptions.currency) formatOptions.currency = optStr.trim();
    } else if (formatName === "relativetime" && optStr.indexOf(":") < 0) {
      if (!formatOptions.range) formatOptions.range = optStr.trim();
    } else {
      const opts = optStr.split(";");
      opts.forEach((opt) => {
        if (opt) {
          const [key, ...rest] = opt.split(":");
          const val = rest.join(":").trim().replace(/^'+|'+$/g, "");
          const trimmedKey = key.trim();
          if (!formatOptions[trimmedKey]) formatOptions[trimmedKey] = val;
          if (val === "false") formatOptions[trimmedKey] = false;
          if (val === "true") formatOptions[trimmedKey] = true;
          if (!isNaN(val)) formatOptions[trimmedKey] = parseInt(val, 10);
        }
      });
    }
  }
  return {
    formatName,
    formatOptions
  };
};
var createCachedFormatter = (fn) => {
  const cache = {};
  return (v, l, o) => {
    let optForCache = o;
    if (o && o.interpolationkey && o.formatParams && o.formatParams[o.interpolationkey] && o[o.interpolationkey]) {
      optForCache = {
        ...optForCache,
        [o.interpolationkey]: void 0
      };
    }
    const key = l + JSON.stringify(optForCache);
    let frm = cache[key];
    if (!frm) {
      frm = fn(getCleanedCode(l), o);
      cache[key] = frm;
    }
    return frm(v);
  };
};
var createNonCachedFormatter = (fn) => (v, l, o) => fn(getCleanedCode(l), o)(v);
var Formatter = class {
  constructor(options = {}) {
    this.logger = baseLogger.create("formatter");
    this.options = options;
    this.init(options);
  }
  init(services, options = {
    interpolation: {}
  }) {
    this.formatSeparator = options.interpolation.formatSeparator || ",";
    const cf = options.cacheInBuiltFormats ? createCachedFormatter : createNonCachedFormatter;
    this.formats = {
      number: cf((lng, opt) => {
        const formatter = new Intl.NumberFormat(lng, {
          ...opt
        });
        return (val) => formatter.format(val);
      }),
      currency: cf((lng, opt) => {
        const formatter = new Intl.NumberFormat(lng, {
          ...opt,
          style: "currency"
        });
        return (val) => formatter.format(val);
      }),
      datetime: cf((lng, opt) => {
        const formatter = new Intl.DateTimeFormat(lng, {
          ...opt
        });
        return (val) => formatter.format(val);
      }),
      relativetime: cf((lng, opt) => {
        const formatter = new Intl.RelativeTimeFormat(lng, {
          ...opt
        });
        return (val) => formatter.format(val, opt.range || "day");
      }),
      list: cf((lng, opt) => {
        const formatter = new Intl.ListFormat(lng, {
          ...opt
        });
        return (val) => formatter.format(val);
      })
    };
  }
  add(name, fc) {
    this.formats[name.toLowerCase().trim()] = fc;
  }
  addCached(name, fc) {
    this.formats[name.toLowerCase().trim()] = createCachedFormatter(fc);
  }
  format(value, format, lng, options = {}) {
    const formats = format.split(this.formatSeparator);
    if (formats.length > 1 && formats[0].indexOf("(") > 1 && formats[0].indexOf(")") < 0 && formats.find((f) => f.indexOf(")") > -1)) {
      const lastIndex = formats.findIndex((f) => f.indexOf(")") > -1);
      formats[0] = [formats[0], ...formats.splice(1, lastIndex)].join(this.formatSeparator);
    }
    const result = formats.reduce((mem, f) => {
      const {
        formatName,
        formatOptions
      } = parseFormatStr(f);
      if (this.formats[formatName]) {
        let formatted = mem;
        try {
          const valOptions = options?.formatParams?.[options.interpolationkey] || {};
          const l = valOptions.locale || valOptions.lng || options.locale || options.lng || lng;
          formatted = this.formats[formatName](mem, l, {
            ...formatOptions,
            ...options,
            ...valOptions
          });
        } catch (error) {
          this.logger.warn(error);
        }
        return formatted;
      } else {
        this.logger.warn(`there was no format function for ${formatName}`);
      }
      return mem;
    }, value);
    return result;
  }
};
var removePending = (q, name) => {
  if (q.pending[name] !== void 0) {
    delete q.pending[name];
    q.pendingCount--;
  }
};
var Connector = class extends EventEmitter {
  constructor(backend, store, services, options = {}) {
    super();
    this.backend = backend;
    this.store = store;
    this.services = services;
    this.languageUtils = services.languageUtils;
    this.options = options;
    this.logger = baseLogger.create("backendConnector");
    this.waitingReads = [];
    this.maxParallelReads = options.maxParallelReads || 10;
    this.readingCalls = 0;
    this.maxRetries = options.maxRetries >= 0 ? options.maxRetries : 5;
    this.retryTimeout = options.retryTimeout >= 1 ? options.retryTimeout : 350;
    this.state = {};
    this.queue = [];
    this.backend?.init?.(services, options.backend, options);
  }
  queueLoad(languages, namespaces, options, callback) {
    const toLoad = {};
    const pending = {};
    const toLoadLanguages = {};
    const toLoadNamespaces = {};
    languages.forEach((lng) => {
      let hasAllNamespaces = true;
      namespaces.forEach((ns) => {
        const name = `${lng}|${ns}`;
        if (!options.reload && this.store.hasResourceBundle(lng, ns)) {
          this.state[name] = 2;
        } else if (this.state[name] < 0) ;
        else if (this.state[name] === 1) {
          if (pending[name] === void 0) pending[name] = true;
        } else {
          this.state[name] = 1;
          hasAllNamespaces = false;
          if (pending[name] === void 0) pending[name] = true;
          if (toLoad[name] === void 0) toLoad[name] = true;
          if (toLoadNamespaces[ns] === void 0) toLoadNamespaces[ns] = true;
        }
      });
      if (!hasAllNamespaces) toLoadLanguages[lng] = true;
    });
    if (Object.keys(toLoad).length || Object.keys(pending).length) {
      this.queue.push({
        pending,
        pendingCount: Object.keys(pending).length,
        loaded: {},
        errors: [],
        callback
      });
    }
    return {
      toLoad: Object.keys(toLoad),
      pending: Object.keys(pending),
      toLoadLanguages: Object.keys(toLoadLanguages),
      toLoadNamespaces: Object.keys(toLoadNamespaces)
    };
  }
  loaded(name, err, data) {
    const s = name.split("|");
    const lng = s[0];
    const ns = s[1];
    if (err) this.emit("failedLoading", lng, ns, err);
    if (!err && data) {
      this.store.addResourceBundle(lng, ns, data, void 0, void 0, {
        skipCopy: true
      });
    }
    this.state[name] = err ? -1 : 2;
    if (err && data) this.state[name] = 0;
    const loaded = {};
    this.queue.forEach((q) => {
      pushPath(q.loaded, [lng], ns);
      removePending(q, name);
      if (err) q.errors.push(err);
      if (q.pendingCount === 0 && !q.done) {
        Object.keys(q.loaded).forEach((l) => {
          if (!loaded[l]) loaded[l] = {};
          const loadedKeys = q.loaded[l];
          if (loadedKeys.length) {
            loadedKeys.forEach((n) => {
              if (loaded[l][n] === void 0) loaded[l][n] = true;
            });
          }
        });
        q.done = true;
        if (q.errors.length) {
          q.callback(q.errors);
        } else {
          q.callback();
        }
      }
    });
    this.emit("loaded", loaded);
    this.queue = this.queue.filter((q) => !q.done);
  }
  read(lng, ns, fcName, tried = 0, wait = this.retryTimeout, callback) {
    if (!lng.length) return callback(null, {});
    if (this.readingCalls >= this.maxParallelReads) {
      this.waitingReads.push({
        lng,
        ns,
        fcName,
        tried,
        wait,
        callback
      });
      return;
    }
    this.readingCalls++;
    const resolver = (err, data) => {
      this.readingCalls--;
      if (this.waitingReads.length > 0) {
        const next = this.waitingReads.shift();
        this.read(next.lng, next.ns, next.fcName, next.tried, next.wait, next.callback);
      }
      if (err && data && tried < this.maxRetries) {
        setTimeout(() => {
          this.read.call(this, lng, ns, fcName, tried + 1, wait * 2, callback);
        }, wait);
        return;
      }
      callback(err, data);
    };
    const fc = this.backend[fcName].bind(this.backend);
    if (fc.length === 2) {
      try {
        const r = fc(lng, ns);
        if (r && typeof r.then === "function") {
          r.then((data) => resolver(null, data)).catch(resolver);
        } else {
          resolver(null, r);
        }
      } catch (err) {
        resolver(err);
      }
      return;
    }
    return fc(lng, ns, resolver);
  }
  prepareLoading(languages, namespaces, options = {}, callback) {
    if (!this.backend) {
      this.logger.warn("No backend was added via i18next.use. Will not load resources.");
      return callback && callback();
    }
    if (isString(languages)) languages = this.languageUtils.toResolveHierarchy(languages);
    if (isString(namespaces)) namespaces = [namespaces];
    const toLoad = this.queueLoad(languages, namespaces, options, callback);
    if (!toLoad.toLoad.length) {
      if (!toLoad.pending.length) callback();
      return null;
    }
    toLoad.toLoad.forEach((name) => {
      this.loadOne(name);
    });
  }
  load(languages, namespaces, callback) {
    this.prepareLoading(languages, namespaces, {}, callback);
  }
  reload(languages, namespaces, callback) {
    this.prepareLoading(languages, namespaces, {
      reload: true
    }, callback);
  }
  loadOne(name, prefix = "") {
    const s = name.split("|");
    const lng = s[0];
    const ns = s[1];
    this.read(lng, ns, "read", void 0, void 0, (err, data) => {
      if (err) this.logger.warn(`${prefix}loading namespace ${ns} for language ${lng} failed`, err);
      if (!err && data) this.logger.log(`${prefix}loaded namespace ${ns} for language ${lng}`, data);
      this.loaded(name, err, data);
    });
  }
  saveMissing(languages, namespace, key, fallbackValue, isUpdate, options = {}, clb = () => {
  }) {
    if (this.services?.utils?.hasLoadedNamespace && !this.services?.utils?.hasLoadedNamespace(namespace)) {
      this.logger.warn(`did not save key "${key}" as the namespace "${namespace}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!");
      return;
    }
    if (key === void 0 || key === null || key === "") return;
    if (this.backend?.create) {
      const opts = {
        ...options,
        isUpdate
      };
      const fc = this.backend.create.bind(this.backend);
      if (fc.length < 6) {
        try {
          let r;
          if (fc.length === 5) {
            r = fc(languages, namespace, key, fallbackValue, opts);
          } else {
            r = fc(languages, namespace, key, fallbackValue);
          }
          if (r && typeof r.then === "function") {
            r.then((data) => clb(null, data)).catch(clb);
          } else {
            clb(null, r);
          }
        } catch (err) {
          clb(err);
        }
      } else {
        fc(languages, namespace, key, fallbackValue, clb, opts);
      }
    }
    if (!languages || !languages[0]) return;
    this.store.addResource(languages[0], namespace, key, fallbackValue);
  }
};
var get = () => ({
  debug: false,
  initAsync: true,
  ns: ["translation"],
  defaultNS: ["translation"],
  fallbackLng: ["dev"],
  fallbackNS: false,
  supportedLngs: false,
  nonExplicitSupportedLngs: false,
  load: "all",
  preload: false,
  simplifyPluralSuffix: true,
  keySeparator: ".",
  nsSeparator: ":",
  pluralSeparator: "_",
  contextSeparator: "_",
  partialBundledLanguages: false,
  saveMissing: false,
  updateMissing: false,
  saveMissingTo: "fallback",
  saveMissingPlurals: true,
  missingKeyHandler: false,
  missingInterpolationHandler: false,
  postProcess: false,
  postProcessPassResolved: false,
  returnNull: false,
  returnEmptyString: true,
  returnObjects: false,
  joinArrays: false,
  returnedObjectHandler: false,
  parseMissingKeyHandler: false,
  appendNamespaceToMissingKey: false,
  appendNamespaceToCIMode: false,
  overloadTranslationOptionHandler: (args) => {
    let ret = {};
    if (typeof args[1] === "object") ret = args[1];
    if (isString(args[1])) ret.defaultValue = args[1];
    if (isString(args[2])) ret.tDescription = args[2];
    if (typeof args[2] === "object" || typeof args[3] === "object") {
      const options = args[3] || args[2];
      Object.keys(options).forEach((key) => {
        ret[key] = options[key];
      });
    }
    return ret;
  },
  interpolation: {
    escapeValue: true,
    format: (value) => value,
    prefix: "{{",
    suffix: "}}",
    formatSeparator: ",",
    unescapePrefix: "-",
    nestingPrefix: "$t(",
    nestingSuffix: ")",
    nestingOptionsSeparator: ",",
    maxReplaces: 1e3,
    skipOnVariables: true
  },
  cacheInBuiltFormats: true
});
var transformOptions = (options) => {
  if (isString(options.ns)) options.ns = [options.ns];
  if (isString(options.fallbackLng)) options.fallbackLng = [options.fallbackLng];
  if (isString(options.fallbackNS)) options.fallbackNS = [options.fallbackNS];
  if (options.supportedLngs?.indexOf?.("cimode") < 0) {
    options.supportedLngs = options.supportedLngs.concat(["cimode"]);
  }
  if (typeof options.initImmediate === "boolean") options.initAsync = options.initImmediate;
  return options;
};
var noop = () => {
};
var bindMemberFunctions = (inst) => {
  const mems = Object.getOwnPropertyNames(Object.getPrototypeOf(inst));
  mems.forEach((mem) => {
    if (typeof inst[mem] === "function") {
      inst[mem] = inst[mem].bind(inst);
    }
  });
};
var SUPPORT_NOTICE_KEY = "__i18next_supportNoticeShown";
var getSupportNoticeShown = () => {
  if (typeof globalThis !== "undefined" && !!globalThis[SUPPORT_NOTICE_KEY]) return true;
  if (typeof process !== "undefined" && process.env && process.env.I18NEXT_NO_SUPPORT_NOTICE) return true;
  if (typeof process !== "undefined" && process.env && false) return true;
  return false;
};
var setSupportNoticeShown = () => {
  if (typeof globalThis !== "undefined") globalThis[SUPPORT_NOTICE_KEY] = true;
};
var usesLocize = (inst) => {
  if (inst?.modules?.backend?.name?.indexOf("Locize") > 0) return true;
  if (inst?.modules?.backend?.constructor?.name?.indexOf("Locize") > 0) return true;
  if (inst?.options?.backend?.backends) {
    if (inst.options.backend.backends.some((b) => b?.name?.indexOf("Locize") > 0 || b?.constructor?.name?.indexOf("Locize") > 0)) return true;
  }
  if (inst?.options?.backend?.projectId) return true;
  if (inst?.options?.backend?.backendOptions) {
    if (inst.options.backend.backendOptions.some((b) => b?.projectId)) return true;
  }
  return false;
};
var I18n = class _I18n extends EventEmitter {
  constructor(options = {}, callback) {
    super();
    this.options = transformOptions(options);
    this.services = {};
    this.logger = baseLogger;
    this.modules = {
      external: []
    };
    bindMemberFunctions(this);
    if (callback && !this.isInitialized && !options.isClone) {
      if (!this.options.initAsync) {
        this.init(options, callback);
        return this;
      }
      setTimeout(() => {
        this.init(options, callback);
      }, 0);
    }
  }
  init(options = {}, callback) {
    this.isInitializing = true;
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    if (options.defaultNS == null && options.ns) {
      if (isString(options.ns)) {
        options.defaultNS = options.ns;
      } else if (options.ns.indexOf("translation") < 0) {
        options.defaultNS = options.ns[0];
      }
    }
    const defOpts = get();
    this.options = {
      ...defOpts,
      ...this.options,
      ...transformOptions(options)
    };
    this.options.interpolation = {
      ...defOpts.interpolation,
      ...this.options.interpolation
    };
    if (options.keySeparator !== void 0) {
      this.options.userDefinedKeySeparator = options.keySeparator;
    }
    if (options.nsSeparator !== void 0) {
      this.options.userDefinedNsSeparator = options.nsSeparator;
    }
    if (typeof this.options.overloadTranslationOptionHandler !== "function") {
      this.options.overloadTranslationOptionHandler = defOpts.overloadTranslationOptionHandler;
    }
    if (this.options.showSupportNotice !== false && !usesLocize(this) && !getSupportNoticeShown()) {
      if (typeof console !== "undefined" && typeof console.info !== "undefined") console.info("\u{1F310} i18next is made possible by our own product, Locize \u2014 consider powering your project with managed localization (AI, CDN, integrations): https://locize.com \u{1F499}");
      setSupportNoticeShown();
    }
    const createClassOnDemand = (ClassOrObject) => {
      if (!ClassOrObject) return null;
      if (typeof ClassOrObject === "function") return new ClassOrObject();
      return ClassOrObject;
    };
    if (!this.options.isClone) {
      if (this.modules.logger) {
        baseLogger.init(createClassOnDemand(this.modules.logger), this.options);
      } else {
        baseLogger.init(null, this.options);
      }
      let formatter;
      if (this.modules.formatter) {
        formatter = this.modules.formatter;
      } else {
        formatter = Formatter;
      }
      const lu = new LanguageUtil(this.options);
      this.store = new ResourceStore(this.options.resources, this.options);
      const s = this.services;
      s.logger = baseLogger;
      s.resourceStore = this.store;
      s.languageUtils = lu;
      s.pluralResolver = new PluralResolver(lu, {
        prepend: this.options.pluralSeparator,
        simplifyPluralSuffix: this.options.simplifyPluralSuffix
      });
      const usingLegacyFormatFunction = this.options.interpolation.format && this.options.interpolation.format !== defOpts.interpolation.format;
      if (usingLegacyFormatFunction) {
        this.logger.deprecate(`init: you are still using the legacy format function, please use the new approach: https://www.i18next.com/translation-function/formatting`);
      }
      if (formatter && (!this.options.interpolation.format || this.options.interpolation.format === defOpts.interpolation.format)) {
        s.formatter = createClassOnDemand(formatter);
        if (s.formatter.init) s.formatter.init(s, this.options);
        this.options.interpolation.format = s.formatter.format.bind(s.formatter);
      }
      s.interpolator = new Interpolator(this.options);
      s.utils = {
        hasLoadedNamespace: this.hasLoadedNamespace.bind(this)
      };
      s.backendConnector = new Connector(createClassOnDemand(this.modules.backend), s.resourceStore, s, this.options);
      s.backendConnector.on("*", (event, ...args) => {
        this.emit(event, ...args);
      });
      if (this.modules.languageDetector) {
        s.languageDetector = createClassOnDemand(this.modules.languageDetector);
        if (s.languageDetector.init) s.languageDetector.init(s, this.options.detection, this.options);
      }
      if (this.modules.i18nFormat) {
        s.i18nFormat = createClassOnDemand(this.modules.i18nFormat);
        if (s.i18nFormat.init) s.i18nFormat.init(this);
      }
      this.translator = new Translator(this.services, this.options);
      this.translator.on("*", (event, ...args) => {
        this.emit(event, ...args);
      });
      this.modules.external.forEach((m) => {
        if (m.init) m.init(this);
      });
    }
    this.format = this.options.interpolation.format;
    if (!callback) callback = noop;
    if (this.options.fallbackLng && !this.services.languageDetector && !this.options.lng) {
      const codes = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
      if (codes.length > 0 && codes[0] !== "dev") this.options.lng = codes[0];
    }
    if (!this.services.languageDetector && !this.options.lng) {
      this.logger.warn("init: no languageDetector is used and no lng is defined");
    }
    const storeApi = ["getResource", "hasResourceBundle", "getResourceBundle", "getDataByLanguage"];
    storeApi.forEach((fcName) => {
      this[fcName] = (...args) => this.store[fcName](...args);
    });
    const storeApiChained = ["addResource", "addResources", "addResourceBundle", "removeResourceBundle"];
    storeApiChained.forEach((fcName) => {
      this[fcName] = (...args) => {
        this.store[fcName](...args);
        return this;
      };
    });
    const deferred = defer();
    const load = () => {
      const finish = (err, t2) => {
        this.isInitializing = false;
        if (this.isInitialized && !this.initializedStoreOnce) this.logger.warn("init: i18next is already initialized. You should call init just once!");
        this.isInitialized = true;
        if (!this.options.isClone) this.logger.log("initialized", this.options);
        this.emit("initialized", this.options);
        deferred.resolve(t2);
        callback(err, t2);
      };
      if (this.languages && !this.isInitialized) return finish(null, this.t.bind(this));
      this.changeLanguage(this.options.lng, finish);
    };
    if (this.options.resources || !this.options.initAsync) {
      load();
    } else {
      setTimeout(load, 0);
    }
    return deferred;
  }
  loadResources(language, callback = noop) {
    let usedCallback = callback;
    const usedLng = isString(language) ? language : this.language;
    if (typeof language === "function") usedCallback = language;
    if (!this.options.resources || this.options.partialBundledLanguages) {
      if (usedLng?.toLowerCase() === "cimode" && (!this.options.preload || this.options.preload.length === 0)) return usedCallback();
      const toLoad = [];
      const append = (lng) => {
        if (!lng) return;
        if (lng === "cimode") return;
        const lngs = this.services.languageUtils.toResolveHierarchy(lng);
        lngs.forEach((l) => {
          if (l === "cimode") return;
          if (toLoad.indexOf(l) < 0) toLoad.push(l);
        });
      };
      if (!usedLng) {
        const fallbacks = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
        fallbacks.forEach((l) => append(l));
      } else {
        append(usedLng);
      }
      this.options.preload?.forEach?.((l) => append(l));
      this.services.backendConnector.load(toLoad, this.options.ns, (e) => {
        if (!e && !this.resolvedLanguage && this.language) this.setResolvedLanguage(this.language);
        usedCallback(e);
      });
    } else {
      usedCallback(null);
    }
  }
  reloadResources(lngs, ns, callback) {
    const deferred = defer();
    if (typeof lngs === "function") {
      callback = lngs;
      lngs = void 0;
    }
    if (typeof ns === "function") {
      callback = ns;
      ns = void 0;
    }
    if (!lngs) lngs = this.languages;
    if (!ns) ns = this.options.ns;
    if (!callback) callback = noop;
    this.services.backendConnector.reload(lngs, ns, (err) => {
      deferred.resolve();
      callback(err);
    });
    return deferred;
  }
  use(module) {
    if (!module) throw new Error("You are passing an undefined module! Please check the object you are passing to i18next.use()");
    if (!module.type) throw new Error("You are passing a wrong module! Please check the object you are passing to i18next.use()");
    if (module.type === "backend") {
      this.modules.backend = module;
    }
    if (module.type === "logger" || module.log && module.warn && module.error) {
      this.modules.logger = module;
    }
    if (module.type === "languageDetector") {
      this.modules.languageDetector = module;
    }
    if (module.type === "i18nFormat") {
      this.modules.i18nFormat = module;
    }
    if (module.type === "postProcessor") {
      postProcessor.addPostProcessor(module);
    }
    if (module.type === "formatter") {
      this.modules.formatter = module;
    }
    if (module.type === "3rdParty") {
      this.modules.external.push(module);
    }
    return this;
  }
  setResolvedLanguage(l) {
    if (!l || !this.languages) return;
    if (["cimode", "dev"].indexOf(l) > -1) return;
    for (let li = 0; li < this.languages.length; li++) {
      const lngInLngs = this.languages[li];
      if (["cimode", "dev"].indexOf(lngInLngs) > -1) continue;
      if (this.store.hasLanguageSomeTranslations(lngInLngs)) {
        this.resolvedLanguage = lngInLngs;
        break;
      }
    }
    if (!this.resolvedLanguage && this.languages.indexOf(l) < 0 && this.store.hasLanguageSomeTranslations(l)) {
      this.resolvedLanguage = l;
      this.languages.unshift(l);
    }
  }
  changeLanguage(lng, callback) {
    this.isLanguageChangingTo = lng;
    const deferred = defer();
    this.emit("languageChanging", lng);
    const setLngProps = (l) => {
      this.language = l;
      this.languages = this.services.languageUtils.toResolveHierarchy(l);
      this.resolvedLanguage = void 0;
      this.setResolvedLanguage(l);
    };
    const done = (err, l) => {
      if (l) {
        if (this.isLanguageChangingTo === lng) {
          setLngProps(l);
          this.translator.changeLanguage(l);
          this.isLanguageChangingTo = void 0;
          this.emit("languageChanged", l);
          this.logger.log("languageChanged", l);
        }
      } else {
        this.isLanguageChangingTo = void 0;
      }
      deferred.resolve((...args) => this.t(...args));
      if (callback) callback(err, (...args) => this.t(...args));
    };
    const setLng = (lngs) => {
      if (!lng && !lngs && this.services.languageDetector) lngs = [];
      const fl = isString(lngs) ? lngs : lngs && lngs[0];
      const l = this.store.hasLanguageSomeTranslations(fl) ? fl : this.services.languageUtils.getBestMatchFromCodes(isString(lngs) ? [lngs] : lngs);
      if (l) {
        if (!this.language) {
          setLngProps(l);
        }
        if (!this.translator.language) this.translator.changeLanguage(l);
        this.services.languageDetector?.cacheUserLanguage?.(l);
      }
      this.loadResources(l, (err) => {
        done(err, l);
      });
    };
    if (!lng && this.services.languageDetector && !this.services.languageDetector.async) {
      setLng(this.services.languageDetector.detect());
    } else if (!lng && this.services.languageDetector && this.services.languageDetector.async) {
      if (this.services.languageDetector.detect.length === 0) {
        this.services.languageDetector.detect().then(setLng);
      } else {
        this.services.languageDetector.detect(setLng);
      }
    } else {
      setLng(lng);
    }
    return deferred;
  }
  getFixedT(lng, ns, keyPrefix) {
    const fixedT = (key, opts, ...rest) => {
      let o;
      if (typeof opts !== "object") {
        o = this.options.overloadTranslationOptionHandler([key, opts].concat(rest));
      } else {
        o = {
          ...opts
        };
      }
      o.lng = o.lng || fixedT.lng;
      o.lngs = o.lngs || fixedT.lngs;
      o.ns = o.ns || fixedT.ns;
      if (o.keyPrefix !== "") o.keyPrefix = o.keyPrefix || keyPrefix || fixedT.keyPrefix;
      const selectorOpts = {
        ...this.options,
        ...o
      };
      if (typeof o.keyPrefix === "function") o.keyPrefix = keysFromSelector(o.keyPrefix, selectorOpts);
      const keySeparator = this.options.keySeparator || ".";
      let resultKey;
      if (o.keyPrefix && Array.isArray(key)) {
        resultKey = key.map((k) => {
          if (typeof k === "function") k = keysFromSelector(k, selectorOpts);
          return `${o.keyPrefix}${keySeparator}${k}`;
        });
      } else {
        if (typeof key === "function") key = keysFromSelector(key, selectorOpts);
        resultKey = o.keyPrefix ? `${o.keyPrefix}${keySeparator}${key}` : key;
      }
      return this.t(resultKey, o);
    };
    if (isString(lng)) {
      fixedT.lng = lng;
    } else {
      fixedT.lngs = lng;
    }
    fixedT.ns = ns;
    fixedT.keyPrefix = keyPrefix;
    return fixedT;
  }
  t(...args) {
    return this.translator?.translate(...args);
  }
  exists(...args) {
    return this.translator?.exists(...args);
  }
  setDefaultNamespace(ns) {
    this.options.defaultNS = ns;
  }
  hasLoadedNamespace(ns, options = {}) {
    if (!this.isInitialized) {
      this.logger.warn("hasLoadedNamespace: i18next was not initialized", this.languages);
      return false;
    }
    if (!this.languages || !this.languages.length) {
      this.logger.warn("hasLoadedNamespace: i18n.languages were undefined or empty", this.languages);
      return false;
    }
    const lng = options.lng || this.resolvedLanguage || this.languages[0];
    const fallbackLng = this.options ? this.options.fallbackLng : false;
    const lastLng = this.languages[this.languages.length - 1];
    if (lng.toLowerCase() === "cimode") return true;
    const loadNotPending = (l, n) => {
      const loadState = this.services.backendConnector.state[`${l}|${n}`];
      return loadState === -1 || loadState === 0 || loadState === 2;
    };
    if (options.precheck) {
      const preResult = options.precheck(this, loadNotPending);
      if (preResult !== void 0) return preResult;
    }
    if (this.hasResourceBundle(lng, ns)) return true;
    if (!this.services.backendConnector.backend || this.options.resources && !this.options.partialBundledLanguages) return true;
    if (loadNotPending(lng, ns) && (!fallbackLng || loadNotPending(lastLng, ns))) return true;
    return false;
  }
  loadNamespaces(ns, callback) {
    const deferred = defer();
    if (!this.options.ns) {
      if (callback) callback();
      return Promise.resolve();
    }
    if (isString(ns)) ns = [ns];
    ns.forEach((n) => {
      if (this.options.ns.indexOf(n) < 0) this.options.ns.push(n);
    });
    this.loadResources((err) => {
      deferred.resolve();
      if (callback) callback(err);
    });
    return deferred;
  }
  loadLanguages(lngs, callback) {
    const deferred = defer();
    if (isString(lngs)) lngs = [lngs];
    const preloaded = this.options.preload || [];
    const newLngs = lngs.filter((lng) => preloaded.indexOf(lng) < 0 && this.services.languageUtils.isSupportedCode(lng));
    if (!newLngs.length) {
      if (callback) callback();
      return Promise.resolve();
    }
    this.options.preload = preloaded.concat(newLngs);
    this.loadResources((err) => {
      deferred.resolve();
      if (callback) callback(err);
    });
    return deferred;
  }
  dir(lng) {
    if (!lng) lng = this.resolvedLanguage || (this.languages?.length > 0 ? this.languages[0] : this.language);
    if (!lng) return "rtl";
    try {
      const l = new Intl.Locale(lng);
      if (l && l.getTextInfo) {
        const ti = l.getTextInfo();
        if (ti && ti.direction) return ti.direction;
      }
    } catch (e) {
    }
    const rtlLngs = ["ar", "shu", "sqr", "ssh", "xaa", "yhd", "yud", "aao", "abh", "abv", "acm", "acq", "acw", "acx", "acy", "adf", "ads", "aeb", "aec", "afb", "ajp", "apc", "apd", "arb", "arq", "ars", "ary", "arz", "auz", "avl", "ayh", "ayl", "ayn", "ayp", "bbz", "pga", "he", "iw", "ps", "pbt", "pbu", "pst", "prp", "prd", "ug", "ur", "ydd", "yds", "yih", "ji", "yi", "hbo", "men", "xmn", "fa", "jpr", "peo", "pes", "prs", "dv", "sam", "ckb"];
    const languageUtils = this.services?.languageUtils || new LanguageUtil(get());
    if (lng.toLowerCase().indexOf("-latn") > 1) return "ltr";
    return rtlLngs.indexOf(languageUtils.getLanguagePartFromCode(lng)) > -1 || lng.toLowerCase().indexOf("-arab") > 1 ? "rtl" : "ltr";
  }
  static createInstance(options = {}, callback) {
    const instance2 = new _I18n(options, callback);
    instance2.createInstance = _I18n.createInstance;
    return instance2;
  }
  cloneInstance(options = {}, callback = noop) {
    const forkResourceStore = options.forkResourceStore;
    if (forkResourceStore) delete options.forkResourceStore;
    const mergedOptions = {
      ...this.options,
      ...options,
      ...{
        isClone: true
      }
    };
    const clone = new _I18n(mergedOptions);
    if (options.debug !== void 0 || options.prefix !== void 0) {
      clone.logger = clone.logger.clone(options);
    }
    const membersToCopy = ["store", "services", "language"];
    membersToCopy.forEach((m) => {
      clone[m] = this[m];
    });
    clone.services = {
      ...this.services
    };
    clone.services.utils = {
      hasLoadedNamespace: clone.hasLoadedNamespace.bind(clone)
    };
    if (forkResourceStore) {
      const clonedData = Object.keys(this.store.data).reduce((prev, l) => {
        prev[l] = {
          ...this.store.data[l]
        };
        prev[l] = Object.keys(prev[l]).reduce((acc, n) => {
          acc[n] = {
            ...prev[l][n]
          };
          return acc;
        }, prev[l]);
        return prev;
      }, {});
      clone.store = new ResourceStore(clonedData, mergedOptions);
      clone.services.resourceStore = clone.store;
    }
    if (options.interpolation) {
      const defOpts = get();
      const mergedInterpolation = {
        ...defOpts.interpolation,
        ...this.options.interpolation,
        ...options.interpolation
      };
      const mergedForInterpolator = {
        ...mergedOptions,
        interpolation: mergedInterpolation
      };
      clone.services.interpolator = new Interpolator(mergedForInterpolator);
    }
    clone.translator = new Translator(clone.services, mergedOptions);
    clone.translator.on("*", (event, ...args) => {
      clone.emit(event, ...args);
    });
    clone.init(mergedOptions, callback);
    clone.translator.options = mergedOptions;
    clone.translator.backendConnector.services.utils = {
      hasLoadedNamespace: clone.hasLoadedNamespace.bind(clone)
    };
    return clone;
  }
  toJSON() {
    return {
      options: this.options,
      store: this.store,
      language: this.language,
      languages: this.languages,
      resolvedLanguage: this.resolvedLanguage
    };
  }
};
var instance = I18n.createInstance();
var createInstance = instance.createInstance;
var dir = instance.dir;
var init = instance.init;
var loadResources = instance.loadResources;
var reloadResources = instance.reloadResources;
var use = instance.use;
var changeLanguage = instance.changeLanguage;
var getFixedT = instance.getFixedT;
var t = instance.t;
var exists = instance.exists;
var setDefaultNamespace = instance.setDefaultNamespace;
var hasLoadedNamespace = instance.hasLoadedNamespace;
var loadNamespaces = instance.loadNamespaces;
var loadLanguages = instance.loadLanguages;

// src/tabs/SystemPromptSection.tsx
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var AVAILABLE_VARIABLES = [
  { name: "{{workspaceName}}", descKey: "variables.workspaceName" },
  { name: "{{workspacePath}}", descKey: "variables.workspacePath" },
  { name: "{{contextWorkspaces}}", descKey: "variables.contextWorkspaces" },
  { name: "{{date}}", descKey: "variables.date" },
  { name: "{{time}}", descKey: "variables.time" }
];
function buildDefaultPromptTemplate() {
  const t2 = instance.t.bind(instance);
  const lines = [];
  lines.push(t2("systemPrompt:workingIn", { name: "{{workspaceName}}" }));
  lines.push(t2("systemPrompt:projectPath", { path: "{{workspacePath}}" }));
  lines.push(t2("systemPrompt:fileRefSyntax"));
  lines.push("");
  lines.push(t2("systemPrompt:contextWorkspaces"));
  lines.push("{{contextWorkspaces}}");
  lines.push("");
  lines.push(t2("systemPrompt:workspaceToolGuidance"));
  return lines.join("\n");
}
function buildDefaultPromptWithValues(workspaceName, workspacePath, contextWorkspaces) {
  const t2 = instance.t.bind(instance);
  const lines = [];
  lines.push(t2("systemPrompt:workingIn", { name: workspaceName }));
  lines.push(t2("systemPrompt:projectPath", { path: workspacePath }));
  lines.push(t2("systemPrompt:fileRefSyntax"));
  if (contextWorkspaces.length > 0) {
    lines.push("");
    lines.push(t2("systemPrompt:contextWorkspaces"));
    for (const ws of contextWorkspaces) {
      lines.push(`- ${ws.name} (${ws.path})`);
      lines.push(`  ${t2("systemPrompt:refSyntax", { name: ws.name })}`);
    }
  }
  lines.push("");
  lines.push(t2("systemPrompt:workspaceToolGuidance"));
  return lines.join("\n");
}
function SystemPromptSection() {
  const { t: t2 } = useTranslation("settings");
  const { config, setCustomPrompt, setEnabled, reset } = useSystemPromptStore();
  const { getCurrentWorkspace, getContextWorkspaces } = useWorkspaceStore();
  const [showVariables, setShowVariables] = useState3(false);
  const handleInsertVariable = (variable) => {
    setCustomPrompt(config.customPrompt + variable);
  };
  const handleFillDefault = () => {
    const currentWorkspace = getCurrentWorkspace();
    const contextWorkspaces = getContextWorkspaces();
    if (currentWorkspace) {
      const prompt = buildDefaultPromptWithValues(
        currentWorkspace.name,
        currentWorkspace.path,
        contextWorkspaces.filter((w) => w?.name && w?.path).map((w) => ({ name: w.name, path: w.path }))
      );
      setCustomPrompt(prompt);
    } else {
      setCustomPrompt(buildDefaultPromptTemplate());
    }
  };
  const handleReset = () => {
    if (window.confirm(t2("systemPrompt.resetConfirm", "\u786E\u5B9A\u8981\u91CD\u7F6E\u4E3A\u9ED8\u8BA4\u8BBE\u7F6E\u5417\uFF1F"))) {
      reset();
    }
  };
  return /* @__PURE__ */ jsxs7("div", { className: "p-4 bg-surface rounded-lg border border-border", children: [
    /* @__PURE__ */ jsxs7("div", { className: "flex items-center justify-between mb-4", children: [
      /* @__PURE__ */ jsxs7("div", { children: [
        /* @__PURE__ */ jsx7("h3", { className: "text-sm font-medium text-text-primary", children: t2("systemPrompt.enable", "\u542F\u7528\u81EA\u5B9A\u4E49\u7CFB\u7EDF\u63D0\u793A\u8BCD") }),
        /* @__PURE__ */ jsx7("p", { className: "text-xs text-text-secondary mt-1", children: t2("systemPrompt.enableDesc", "\u542F\u7528\u540E\u53EF\u81EA\u5B9A\u4E49\u53D1\u9001\u7ED9 AI \u7684\u7CFB\u7EDF\u63D0\u793A\u8BCD\uFF08\u5DE5\u4F5C\u533A\u4FE1\u606F\u59CB\u7EC8\u4FDD\u7559\uFF09") })
      ] }),
      /* @__PURE__ */ jsxs7("label", { className: "relative inline-flex items-center cursor-pointer", children: [
        /* @__PURE__ */ jsx7(
          "input",
          {
            type: "checkbox",
            checked: config.enabled,
            onChange: (e) => setEnabled(e.target.checked),
            className: "sr-only peer"
          }
        ),
        /* @__PURE__ */ jsx7("div", { className: "w-9 h-5 bg-surface-hover rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs7("div", { className: "flex items-center justify-between mb-3", children: [
      /* @__PURE__ */ jsx7("h3", { className: "text-sm font-medium text-text-primary", children: t2("systemPrompt.customPrompt", "\u81EA\u5B9A\u4E49\u63D0\u793A\u8BCD") }),
      /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx7(
          "button",
          {
            type: "button",
            onClick: handleFillDefault,
            disabled: !config.enabled,
            className: `text-xs text-primary hover:underline ${!config.enabled ? "opacity-50 cursor-not-allowed" : ""}`,
            children: t2("systemPrompt.fillDefault", "\u586B\u5165\u9ED8\u8BA4")
          }
        ),
        /* @__PURE__ */ jsx7(
          "button",
          {
            type: "button",
            onClick: () => setShowVariables(!showVariables),
            className: "text-xs text-primary hover:underline",
            children: showVariables ? t2("systemPrompt.hideVariables", "\u9690\u85CF\u53D8\u91CF") : t2("systemPrompt.showVariables", "\u663E\u793A\u53D8\u91CF")
          }
        )
      ] })
    ] }),
    showVariables && /* @__PURE__ */ jsxs7("div", { className: "mb-3 p-3 bg-background-surface rounded-lg", children: [
      /* @__PURE__ */ jsx7("div", { className: "text-xs text-text-secondary mb-2", children: t2("systemPrompt.variablesHint", "\u70B9\u51FB\u53D8\u91CF\u53EF\u63D2\u5165\u5230\u4E0B\u65B9\u7F16\u8F91\u5668\uFF1A") }),
      /* @__PURE__ */ jsx7("div", { className: "flex flex-wrap gap-2", children: AVAILABLE_VARIABLES.map((v) => /* @__PURE__ */ jsx7(
        "button",
        {
          type: "button",
          onClick: () => handleInsertVariable(v.name),
          disabled: !config.enabled,
          className: `px-2 py-1 text-xs rounded bg-background-surface border border-border-subtle hover:border-primary transition-colors ${!config.enabled ? "opacity-50 cursor-not-allowed" : ""}`,
          title: t2(`systemPrompt.${v.descKey}`, v.name),
          children: v.name
        },
        v.name
      )) })
    ] }),
    /* @__PURE__ */ jsx7(
      "textarea",
      {
        value: config.customPrompt,
        onChange: (e) => setCustomPrompt(e.target.value),
        disabled: !config.enabled,
        placeholder: t2(
          "systemPrompt.placeholder",
          "\u8F93\u5165\u81EA\u5B9A\u4E49\u7CFB\u7EDF\u63D0\u793A\u8BCD...\n\n\u53EF\u7528\u53D8\u91CF:\n{{workspaceName}} - \u5F53\u524D\u5DE5\u4F5C\u533A\u540D\u79F0\n{{workspacePath}} - \u5F53\u524D\u5DE5\u4F5C\u533A\u8DEF\u5F84\n{{contextWorkspaces}} - \u5173\u8054\u5DE5\u4F5C\u533A\u5217\u8868\n{{date}} - \u5F53\u524D\u65E5\u671F\n{{time}} - \u5F53\u524D\u65F6\u95F4\n{{defaultPrompt}} - \u9ED8\u8BA4\u7CFB\u7EDF\u63D0\u793A\u8BCD"
        ),
        className: `w-full h-48 p-3 bg-background-surface rounded-lg border border-border-subtle text-sm text-text-primary placeholder-text-muted resize-y focus:outline-none focus:border-primary ${!config.enabled ? "opacity-50 cursor-not-allowed" : ""}`
      }
    ),
    /* @__PURE__ */ jsxs7("div", { className: "flex justify-between items-center mt-2", children: [
      /* @__PURE__ */ jsx7("span", { className: "text-xs text-text-muted", children: t2("systemPrompt.charCount", "{{count}} \u5B57\u7B26", { count: config.customPrompt.length }) }),
      /* @__PURE__ */ jsx7(
        "button",
        {
          type: "button",
          onClick: handleReset,
          className: "text-xs text-text-secondary hover:text-danger transition-colors",
          children: t2("systemPrompt.reset", "\u91CD\u7F6E\u4E3A\u9ED8\u8BA4")
        }
      )
    ] }),
    config.enabled && config.customPrompt.trim() && /* @__PURE__ */ jsxs7("div", { className: "mt-4 p-4 bg-background-surface rounded-lg border border-border-subtle", children: [
      /* @__PURE__ */ jsx7("h3", { className: "text-xs font-medium text-text-secondary mb-2", children: t2("systemPrompt.preview", "\u9884\u89C8") }),
      /* @__PURE__ */ jsx7("div", { className: "text-xs font-mono whitespace-pre-wrap text-text-secondary max-h-48 overflow-y-auto", children: config.customPrompt }),
      /* @__PURE__ */ jsx7("p", { className: "text-xs text-text-muted mt-2", children: t2("systemPrompt.previewNote", "\u6B64\u5185\u5BB9\u4F1A\u4F5C\u4E3A\u7CFB\u7EDF\u63D0\u793A\u8BCD\u53D1\u9001\uFF0C\u5DE5\u4F5C\u533A\u4FE1\u606F\u4F1A\u81EA\u52A8\u8FFD\u52A0") })
    ] })
  ] });
}

// src/mobileShim.ts
function isMobileTauriRuntime() {
  try {
    return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  } catch {
    return false;
  }
}
function useMobileConnection() {
  return globalThis.__POLARIS_APP_CORE__?.mobileConnection ?? null;
}

// src/tabs/GeneralTab.tsx
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
function GeneralTab({ config, onConfigChange, loading }) {
  const { t: t2 } = useTranslation("settings");
  const mobileConnection = useMobileConnection();
  const isMobile = isMobileTauriRuntime();
  const [autolaunchSupported, setAutolaunchSupported] = useState4(false);
  useEffect3(() => {
    let cancelled = false;
    getAutolaunchStatus().then((s) => {
      if (!cancelled) setAutolaunchSupported(s.supported);
    }).catch(() => {
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return /* @__PURE__ */ jsxs8("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs8("div", { className: "p-4 bg-surface rounded-lg border border-border", children: [
      /* @__PURE__ */ jsx8("h3", { className: "text-sm font-medium text-text-primary mb-3", children: t2("language.title") }),
      /* @__PURE__ */ jsxs8("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxs8("div", { children: [
          /* @__PURE__ */ jsx8("div", { className: "text-sm text-text-primary", children: t2("language.current") }),
          /* @__PURE__ */ jsx8("div", { className: "text-xs text-text-secondary", children: t2("language.hint") })
        ] }),
        /* @__PURE__ */ jsxs8("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx8(
            "button",
            {
              type: "button",
              onClick: () => onConfigChange({ ...config, language: "zh-CN" }),
              disabled: loading,
              className: `px-3 py-1.5 text-xs rounded-lg transition-colors ${(config.language || "zh-CN") === "zh-CN" ? "bg-primary text-on-primary" : "bg-background-surface border border-border text-text-secondary hover:text-text-primary"} ${loading ? "opacity-50 cursor-not-allowed" : ""}`,
              children: "\u4E2D\u6587"
            }
          ),
          /* @__PURE__ */ jsx8(
            "button",
            {
              type: "button",
              onClick: () => onConfigChange({ ...config, language: "en-US" }),
              disabled: loading,
              className: `px-3 py-1.5 text-xs rounded-lg transition-colors ${config.language === "en-US" ? "bg-primary text-on-primary" : "bg-background-surface border border-border text-text-secondary hover:text-text-primary"} ${loading ? "opacity-50 cursor-not-allowed" : ""}`,
              children: "English"
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx8("div", { className: "p-4 bg-surface rounded-lg border border-border", children: /* @__PURE__ */ jsxs8("div", { className: "flex items-start justify-between gap-3", children: [
      /* @__PURE__ */ jsxs8("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsx8("h3", { className: "text-sm font-medium text-text-primary flex items-center gap-1.5", children: t2("uiControl.title", "AI \u754C\u9762\u63A7\u5236") }),
        /* @__PURE__ */ jsx8("p", { className: "text-xs text-text-secondary mt-1", children: t2("uiControl.description", "\u5141\u8BB8 AI \u8C03\u6574\u4E3B\u9898\u914D\u8272\u4E0E\u5BF9\u8BDD\u6E32\u67D3\u914D\u7F6E\uFF08\u5B57\u53F7\u3001\u6D88\u606F\u95F4\u8DDD\u7B49\uFF09\uFF0C\u4E09\u7AEF\u540C\u6E90\u751F\u6548") }),
        /* @__PURE__ */ jsx8("p", { className: "text-xs text-text-tertiary mt-0.5", children: t2("uiControl.hint", "\u5173\u95ED\u65F6\u9690\u85CF bus \u4E2D\u7684 cap.ui.* \u5DE5\u5177\uFF1B\u5F00\u542F\u540E AI \u5373\u53EF\u7ECF\u5DE5\u5177\u8C03\u7528\u63A7\u5236\u754C\u9762\u6837\u5F0F") })
      ] }),
      /* @__PURE__ */ jsx8(
        "button",
        {
          type: "button",
          role: "switch",
          "aria-checked": config.uiControlEnabled === true,
          "aria-label": config.uiControlEnabled === true ? "\u5173\u95ED AI \u754C\u9762\u63A7\u5236" : "\u5F00\u542F AI \u754C\u9762\u63A7\u5236",
          title: config.uiControlEnabled ? "\u5173\u95ED" : "\u5F00\u542F",
          onClick: () => onConfigChange({ ...config, uiControlEnabled: config.uiControlEnabled !== true }),
          disabled: loading,
          className: `
              relative inline-flex items-center h-6 w-11 rounded-full shrink-0
              transition-colors
              focus:outline-none
              focus-visible:ring-2 focus-visible:ring-primary
              focus-visible:ring-offset-2
              ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              ${config.uiControlEnabled === true ? "bg-primary" : "bg-border"}
            `,
          children: /* @__PURE__ */ jsx8(
            "span",
            {
              className: `
                inline-block h-4 w-4 transform rounded-full bg-white
                shadow-sm transition-transform
                ${config.uiControlEnabled === true ? "translate-x-5" : "translate-x-1"}
              `
            }
          )
        }
      )
    ] }) }),
    autolaunchSupported && /* @__PURE__ */ jsx8("div", { className: "p-4 bg-surface rounded-lg border border-border", children: /* @__PURE__ */ jsxs8("div", { className: "flex items-start justify-between gap-3", children: [
      /* @__PURE__ */ jsxs8("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsx8("h3", { className: "text-sm font-medium text-text-primary", children: t2("autolaunch.title", "\u5F00\u673A\u81EA\u52A8\u542F\u52A8") }),
        /* @__PURE__ */ jsx8("p", { className: "text-xs text-text-secondary mt-1", children: t2("autolaunch.description", "\u767B\u5F55\u7CFB\u7EDF\u540E\u81EA\u52A8\u542F\u52A8 Polaris\uFF08\u6700\u5C0F\u5316\u542F\u52A8\uFF0C\u4E0D\u62A2\u7126\u70B9\uFF09") }),
        /* @__PURE__ */ jsx8("p", { className: "text-xs text-text-tertiary mt-0.5", children: t2("autolaunch.hint", "\u4FDD\u5B58\u540E\u751F\u6548\uFF1B\u5347\u7EA7/\u632A\u76EE\u5F55\u5BFC\u81F4\u7684\u8DEF\u5F84\u6F02\u79FB\u4F1A\u5728\u4E0B\u6B21\u542F\u52A8\u65F6\u81EA\u52A8\u7EA0\u6B63") })
      ] }),
      /* @__PURE__ */ jsx8(
        "button",
        {
          type: "button",
          role: "switch",
          "aria-checked": config.autoLaunch === true,
          "aria-label": config.autoLaunch === true ? "\u5173\u95ED\u5F00\u673A\u81EA\u52A8\u542F\u52A8" : "\u5F00\u542F\u5F00\u673A\u81EA\u52A8\u542F\u52A8",
          title: config.autoLaunch ? "\u5173\u95ED" : "\u5F00\u542F",
          onClick: () => onConfigChange({ ...config, autoLaunch: config.autoLaunch !== true }),
          disabled: loading,
          className: `
                relative inline-flex items-center h-6 w-11 rounded-full shrink-0
                transition-colors
                focus:outline-none
                focus-visible:ring-2 focus-visible:ring-primary
                focus-visible:ring-offset-2
                ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                ${config.autoLaunch === true ? "bg-primary" : "bg-border"}
              `,
          children: /* @__PURE__ */ jsx8(
            "span",
            {
              className: `
                  inline-block h-4 w-4 transform rounded-full bg-white
                  shadow-sm transition-transform
                  ${config.autoLaunch === true ? "translate-x-5" : "translate-x-1"}
                `
            }
          )
        }
      )
    ] }) }),
    /* @__PURE__ */ jsx8(FocusModeSettings, {}),
    /* @__PURE__ */ jsx8(SystemPromptSection, {}),
    isMobile && mobileConnection && /* @__PURE__ */ jsxs8("div", { className: "p-4 bg-surface rounded-lg border border-border", children: [
      /* @__PURE__ */ jsxs8("h3", { className: "text-sm font-medium text-text-primary mb-3 flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx8(Smartphone, { size: 14 }),
        t2("mobileConnection.title", "\u79FB\u52A8\u7AEF\u8FDE\u63A5\u7BA1\u7406")
      ] }),
      /* @__PURE__ */ jsxs8("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxs8("div", { className: "min-w-0 flex-1 pr-4", children: [
          /* @__PURE__ */ jsxs8("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx8(
              "span",
              {
                className: `w-2 h-2 rounded-full shrink-0 ${mobileConnection.connected ? "bg-success shadow-[0_0_6px_rgb(var(--c-status-success)/0.5)]" : "bg-text-tertiary"}`
              }
            ),
            /* @__PURE__ */ jsx8("span", { className: "text-sm text-text-primary", children: mobileConnection.connected ? t2("mobileConnection.connected", "\u5DF2\u8FDE\u63A5") : t2("mobileConnection.disconnected", "\u672A\u8FDE\u63A5") })
          ] }),
          /* @__PURE__ */ jsx8("p", { className: "text-xs text-text-secondary mt-1", children: t2("mobileConnection.hint", "\u7BA1\u7406\u79FB\u52A8\u7AEF\u4E0E\u684C\u9762\u7AEF\u7684\u8FDE\u63A5\uFF0C\u53EF\u67E5\u770B\u72B6\u6001\u6216\u65AD\u5F00\u8FDE\u63A5") })
        ] }),
        /* @__PURE__ */ jsxs8(
          "button",
          {
            type: "button",
            onClick: mobileConnection.openConnectionSettings,
            className: "shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border border-border bg-surface text-text-secondary hover:bg-background-hover transition-colors",
            children: [
              mobileConnection.connected ? /* @__PURE__ */ jsx8(PlugZap, { size: 12 }) : /* @__PURE__ */ jsx8(Plug, { size: 12 }),
              t2("mobileConnection.manage", "\u7BA1\u7406\u8FDE\u63A5")
            ]
          }
        )
      ] })
    ] })
  ] });
}

// src/tabs/ThemeTab.tsx
import * as React2 from "react";

// src/ThemeManager.tsx
import * as React from "react";

// src/types/theme.ts
var BUILT_IN_THEME_IDS = {
  DARK: "00000000-0000-0000-0000-000000000001",
  LIGHT: "00000000-0000-0000-0000-000000000002"
};
function isBuiltInThemeId(id) {
  return Object.values(BUILT_IN_THEME_IDS).includes(id);
}

// src/ThemeManager.tsx
import { jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
function ThemeManager() {
  const { t: t2 } = useTranslation("settings");
  const {
    themes,
    activeThemeId,
    setThemeById,
    deleteTheme,
    downloadTheme
  } = useThemeStore();
  React.useEffect(() => {
    void useThemeStore.getState().syncFromRemote();
  }, []);
  const handleDelete = (id) => {
    if (isBuiltInThemeId(id)) return;
    const theme = themes.find((t3) => t3.id === id);
    if (!theme) return;
    if (!confirm(t2("settings:theme.deleteConfirm", `\u786E\u5B9A\u5220\u9664\u4E3B\u9898\u300C${theme.name}\u300D\uFF1F`))) return;
    deleteTheme(id);
  };
  const handleUse = (id) => {
    void setThemeById(id);
  };
  return /* @__PURE__ */ jsxs9("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsx9("div", { className: "flex items-center justify-between", children: /* @__PURE__ */ jsxs9("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsx9("h3", { className: "text-sm font-medium text-text-primary", children: t2("settings:theme.title", "\u5168\u90E8\u4E3B\u9898") }),
      /* @__PURE__ */ jsxs9("span", { className: "text-xs text-text-muted", children: [
        themes.length,
        " ",
        t2("settings:theme.count", "\u4E2A\u4E3B\u9898"),
        " \xB7 ",
        t2("settings:theme.using", "\u4F7F\u7528\u4E2D"),
        ": ",
        themes.find((t3) => t3.id === activeThemeId)?.name ?? "Dark"
      ] })
    ] }) }),
    /* @__PURE__ */ jsx9("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3", children: themes.map((theme) => {
      const isActive = theme.id === activeThemeId;
      const isBuiltIn = theme.builtIn;
      return /* @__PURE__ */ jsxs9(
        "div",
        {
          className: `relative rounded-xl border overflow-hidden transition-all duration-200 ${isActive ? "border-primary bg-background-surface shadow-glow" : "border-border bg-surface hover:border-border-strong hover:shadow-soft"}`,
          children: [
            /* @__PURE__ */ jsxs9(
              "div",
              {
                className: "h-24 flex items-center justify-center relative overflow-hidden theme-preview-strip",
                style: {
                  background: `linear-gradient(135deg,
                    rgb(${theme.colors.background.base}) 0%,
                    rgb(${theme.colors.background.elevated}) 50%,
                    rgb(${theme.colors.primary.base}) 100%)`
                },
                children: [
                  /* @__PURE__ */ jsxs9("div", { className: "absolute bottom-3 left-3 flex gap-1.5", children: [
                    /* @__PURE__ */ jsx9("span", { className: "w-2 h-2 rounded-full", style: { background: `rgb(${theme.colors.primary.base})` } }),
                    /* @__PURE__ */ jsx9("span", { className: "w-2 h-2 rounded-full", style: { background: `rgb(${theme.colors.accent.ai})` } }),
                    /* @__PURE__ */ jsx9("span", { className: "w-2 h-2 rounded-full", style: { background: `rgb(${theme.colors.status.success})` } })
                  ] }),
                  isActive && /* @__PURE__ */ jsxs9("span", { className: "absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary text-on-primary shadow-glow", children: [
                    "\u25CF ",
                    t2("settings:theme.inUse", "\u4F7F\u7528\u4E2D")
                  ] })
                ]
              }
            ),
            /* @__PURE__ */ jsxs9("div", { className: "p-3", children: [
              /* @__PURE__ */ jsxs9("div", { className: "flex items-start justify-between mb-1", children: [
                /* @__PURE__ */ jsx9("h4", { className: "text-sm font-semibold text-text-primary truncate", children: theme.name }),
                isBuiltIn && /* @__PURE__ */ jsx9("span", { className: "shrink-0 ml-2 px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary", children: t2("settings:theme.builtIn", "\u5185\u7F6E") }),
                !isBuiltIn && /* @__PURE__ */ jsx9("span", { className: "shrink-0 ml-2 px-1.5 py-0.5 rounded text-[10px] bg-success/10 text-success", children: t2("settings:theme.custom", "\u81EA\u5B9A\u4E49") })
              ] }),
              theme.description && /* @__PURE__ */ jsx9("p", { className: "text-xs text-text-tertiary line-clamp-2 mb-2", children: theme.description }),
              /* @__PURE__ */ jsxs9("div", { className: "flex items-center gap-1 pt-2 border-t border-border-subtle", children: [
                /* @__PURE__ */ jsx9(
                  "button",
                  {
                    type: "button",
                    onClick: () => downloadTheme(theme.id),
                    className: "px-2 py-1 text-[11px] rounded-md text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors",
                    children: "\u5BFC\u51FA"
                  }
                ),
                !isBuiltIn && /* @__PURE__ */ jsx9(
                  "button",
                  {
                    type: "button",
                    onClick: () => handleDelete(theme.id),
                    className: "px-2 py-1 text-[11px] rounded-md text-danger hover:bg-danger/10 transition-colors",
                    children: "\u5220\u9664"
                  }
                ),
                !isActive && /* @__PURE__ */ jsx9(
                  "button",
                  {
                    type: "button",
                    onClick: () => handleUse(theme.id),
                    className: "ml-auto px-2 py-1 text-[11px] rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors",
                    children: "\u2713 \u4F7F\u7528"
                  }
                )
              ] })
            ] })
          ]
        },
        theme.id
      );
    }) })
  ] });
}

// src/tabs/ThemeTab.tsx
import { Fragment, jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
function ThemeTab() {
  const { t: t2 } = useTranslation("settings");
  const [showGuide, setShowGuide] = React2.useState(false);
  return /* @__PURE__ */ jsx10(Fragment, { children: /* @__PURE__ */ jsxs10("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs10("div", { className: "rounded-lg border border-border-subtle bg-background-surface", children: [
      /* @__PURE__ */ jsxs10(
        "button",
        {
          type: "button",
          onClick: () => setShowGuide(!showGuide),
          className: "flex w-full items-center gap-2 px-3 py-2 text-left",
          children: [
            /* @__PURE__ */ jsx10(BookOpen, { size: 14, className: "shrink-0 text-text-muted" }),
            /* @__PURE__ */ jsx10("span", { className: "flex-1 text-xs font-medium text-text-secondary", children: t2("theme.guideTitle", "\u4E3B\u9898\u751F\u6210\u6307\u5357") }),
            showGuide ? /* @__PURE__ */ jsx10(ChevronDown, { size: 14, className: "text-text-muted" }) : /* @__PURE__ */ jsx10(ChevronRight, { size: 14, className: "text-text-muted" })
          ]
        }
      ),
      showGuide && /* @__PURE__ */ jsx10("div", { className: "border-t border-border-subtle px-3 py-3", children: /* @__PURE__ */ jsx10(ThemeGuide, {}) })
    ] }),
    /* @__PURE__ */ jsx10(ThemeManager, {})
  ] }) });
}
function ThemeGuide() {
  const [copied, setCopied] = React2.useState(false);
  const guideContent = `# Polaris \u4E3B\u9898\u751F\u6210\u4E0E\u5B89\u88C5\u6307\u5357\uFF08AI \u76F4\u8C03\u7248\uFF09

\u4F60\u662F Polaris \u7684\u4E3B\u9898\u8BBE\u8BA1\u5E08\u3002\u8BF7\u6309\u4EE5\u4E0B\u89C4\u8303\u751F\u6210\u4E3B\u9898\uFF0C\u5E76**\u76F4\u63A5\u8C03\u7528 cap.ui.theme \u5DE5\u5177\u5B89\u88C5\u5E94\u7528**\uFF0C
\u4E0D\u8981\u8F93\u51FA\u8BA9\u7528\u6237\u624B\u52A8\u4FDD\u5B58/\u5BFC\u5165\u7684\u6587\u4EF6\u3002\u82E5\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709 cap.ui.theme \u5DE5\u5177\uFF08bus_dispatch /
\u672A\u66B4\u9732\uFF09\uFF0C\u5148\u63D0\u793A\u7528\u6237\u5728 \u8BBE\u7F6E\u2192\u901A\u7528 \u5F00\u542F\u300CAI \u754C\u9762\u63A7\u5236\u300D\u540E\u91CD\u8BD5\u3002

## \u4F60\u53EF\u7528\u7684\u4E3B\u9898\u52A8\u4F5C\uFF08\u7ECF bus_dispatch(target="cap.ui.theme")\uFF09

- listThemes\uFF1A\u5217\u51FA\u5185\u7F6E\u4E0E\u7528\u6237\u4E3B\u9898
- get\uFF1A\u5F53\u524D\u6FC0\u6D3B\u4E3B\u9898 id
- import\uFF1A{ "theme": <\u4E0B\u65B9 theme \u5BF9\u8C61> } \u2192 \u5B89\u88C5\u5E76\u6FC0\u6D3B\u65B0\u4E3B\u9898\uFF08\u7F3A\u7701\u5B57\u6BB5\u81EA\u52A8\u4EE5 Dark \u8865\u5168\uFF09
- patch\uFF1A{ "palette": { "primary.base": "59 130 246", ... } } \u2192 \u57FA\u4E8E\u5F53\u524D\u4E3B\u9898\u5FAE\u8C03\u914D\u8272
- applyPreset\uFF1A{ "preset": "dark" | "light" } \u2192 \u5207\u6362\u5185\u7F6E\u4E3B\u9898
- setActive\uFF1A{ "id": "<\u4E3B\u9898id>" } \u2192 \u5207\u6362\u5230\u5DF2\u6709\u4E3B\u9898
- export\uFF1A\u5BFC\u51FA\u5F53\u524D\u5B8C\u6574\u4E3B\u9898\u5B9A\u4E49
- delete\uFF1A{ "id": "<\u4E3B\u9898id>" } \u2192 \u5220\u9664\u7528\u6237\u4E3B\u9898\uFF08\u5185\u7F6E\u4E0D\u53EF\u5220\uFF09

## \u7528\u6237\u9700\u6C42\u6A21\u677F

- \u540D\u79F0\uFF1A[\u4E3B\u9898\u540D]
- \u63CF\u8FF0\uFF1A[\u98CE\u683C\u63CF\u8FF0]
- \u4F5C\u8005\uFF1A[\u4F5C\u8005\u540D]
- \u6574\u4F53\u98CE\u683C\uFF1A\u6697\u8272 / \u6D45\u8272\uFF1B\u4E3B\u8272\u8C03 / \u80CC\u666F\u8272\u503E\u5411 / \u6587\u5B57\u5BF9\u6BD4\u5EA6
- \u53EF\u9009\uFF1A\u58C1\u7EB8\uFF08Unsplash\uFF09\u3001\u5706\u89D2\u98CE\u683C\u3001\u5B57\u4F53\u3001\u81EA\u5B9A\u4E49 CSS

## theme \u5BF9\u8C61\u7ED3\u6784\uFF08import \u7684 payload\uFF1B\u989C\u8272\u4E3A\u7A7A\u683C\u5206\u9694 RGB \u4E09\u5143\u7EC4\uFF0C\u5982 "59 130 246"\uFF09


{
  "name": "\u4E3B\u9898\u540D\u79F0",
  "description": "\u4E3B\u9898\u63CF\u8FF0",
  "author": "\u4F5C\u8005\u540D",
  "version": 1,

    "colors": {
      "primary": {
        "base": "59 130 246",
        "hover": "37 99 235",
        "50": "239 246 255",
        "100": "219 234 254",
        "200": "191 219 254",
        "300": "147 197 253",
        "400": "96 165 250",
        "500": "59 130 246",
        "600": "37 99 235",
        "700": "29 78 216"
      },
      "background": {
        "base": "0 0 0",
        "elevated": "26 26 31",
        "surface": "37 37 43",
        "hover": "45 45 53",
        "active": "53 53 61",
        "tertiary": "33 38 45",
        "secondary": "22 27 34"
      },
      "border": { "base": "255 255 255" },
      "text": {
        "primary": "248 248 248",
        "secondary": "180 180 184",
        "tertiary": "142 142 147",
        "muted": "109 109 112"
      },
      "status": {
        "warning": "251 191 36",
        "success": "52 211 153",
        "danger": "248 113 113",
        "info": "96 165 250",
        "done": "16 185 129",
        "failed": "239 68 68",
        "neutral": "156 163 175"
      },
      "priority": {
        "low": "156 163 175",
        "normal": "96 165 250",
        "high": "251 146 60",
        "urgent": "248 113 113"
      },
      "accent": {
        "ai": "167 139 250",
        "prototype": "34 211 238",
        "workspace": "251 191 36"
      },
      "misc": {
        "overlay": "0 0 0",
        "onPrimary": "255 255 255",
        "canvas": "255 255 255",
        "tagBg": "255 255 255",
        "shadow": "0 0 0"
      }
    },

    "typography": {
      "fontSans": "-apple-system, BlinkMacSystemFont, \\"Segoe UI\\", Roboto, sans-serif",
      "fontMono": "\\"JetBrains Mono\\", \\"Fira Code\\", Consolas, monospace",
      "fontSizeBase": "14px",
      "fontWeightNormal": "400",
      "fontWeightMedium": "500",
      "fontWeightSemibold": "600",
      "letterSpacing": "normal",
      "chatFontSize": 14,
      "chatLineHeight": 1.55,
      "chatCodeFontSize": 13,
      "chatInputFontSize": 14
    },

    "shape": {
      "radiusSm": "4px",
      "radiusMd": "8px",
      "radiusLg": "12px",
      "radiusXl": "16px",
      "radiusFull": "9999px",
      "chatBubbleRadius": "16px",
      "borderWidth": "1px",
      "borderStyle": "solid",
      "chatBubblePaddingX": "16px",
      "chatBubblePaddingY": "12px"
    },

    "motion": {
      "transitionFast": "0.15s",
      "transitionNormal": "0.3s",
      "transitionSlow": "0.5s",
      "easeDefault": "ease",
      "easeIn": "ease-in",
      "easeOut": "ease-out",
      "easeInOut": "ease-in-out",
      "motionReduce": false
    },

    "layout": {
      "windowOpacity": { "normal": 100, "compact": 100 },
      "chatMessageGap": 10,
      "chatBlockGap": 6,
      "chatParagraphSpacing": 4
    },

    "immersive": {
      "enabled": true,
      "wallpaper": {
        "type": "image",
        "image": "https://images.unsplash.com/photo-xxxxx?q=80&w=1920",
        "opacity": 0.65,
        "positionX": 50,
        "positionY": 50,
        "size": "cover"
      },
      "layerOpacity": {
        "panel": 0.45,
        "surface": 0.35,
        "child": 0.45
      },
      "effects": {
        "panelBlur": 12,
        "webTexture": 0.08,
        "blueAccent": 0.4,
        "hoverOpacity": 0.5
      }
    },

  "customCss": "/* \u53EF\u9009\u7684 L6 \u81EA\u5B9A\u4E49 CSS */"
}

## \u8BBE\u8BA1\u539F\u5219

1. \u4E3B\u8272 50-700 \u5E94\u81EA\u7136\u8FC7\u6E21\uFF0C\u4FDD\u6301\u8272\u8C03\u4E00\u81F4
2. \u6697\u8272\u4E3B\u9898 background \u4ECE base \u5230 elevated \u9010\u5C42\u53D8\u4EAE\uFF0C\u5C42\u6B21\u5206\u660E
3. \u6587\u5B57 primary / secondary / tertiary / muted \u4EAE\u5EA6\u5DEE\u8981\u8DB3\u591F\uFF0C\u4FDD\u8BC1\u53EF\u8BFB
4. \u6C89\u6D78\u5C42 opacity \u5EFA\u8BAE 0.4-0.7\uFF0CpanelBlur \u5EFA\u8BAE 8-16px
5. \u5706\u89D2\u8D8A\u5927\u8D8A\u73B0\u4EE3\uFF0C\u4F46\u63A7\u4EF6\u4E0D\u5B9C\u8D85\u8FC7 16px

## \u5E38\u89C1\u9519\u8BEF

- \u989C\u8272\u503C\u5E26\u62EC\u53F7\u6216 # \u524D\u7F00 \u2192 \u5FC5\u987B\u7528\u7A7A\u683C\u5206\u9694\u7684 RGB \u4E09\u5143\u7EC4
- missing \u5B57\u6BB5 \u2192 \u786E\u4FDD colors \u5C42 40 \u4E2A\u5B57\u6BB5\u5B8C\u6574
- \u5C3E\u968F\u9017\u53F7 \u2192 \u6700\u540E\u4E00\u4E2A\u5B57\u6BB5\u540E\u4E0D\u80FD\u6709\u9017\u53F7
- \u7C7B\u578B\u9519\u8BEF \u2192 chatFontSize \u662F\u6570\u5B57\uFF0C\u4E0D\u662F\u5B57\u7B26\u4E32
- avatar \u94FE\u63A5\u4E0D\u7A33\u5B9A \u2192 \u4F7F\u7528 Unsplash\u3001GitHub \u7B49\u7A33\u5B9A CDN`;
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(guideContent);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = guideContent;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };
  return /* @__PURE__ */ jsxs10("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxs10("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsx10("span", { className: "text-xs text-text-tertiary", children: "\u590D\u5236\u4EE5\u4E0B\u63D0\u793A\u8BCD\u53D1\u7ED9 AI\uFF0CAI \u4F1A\u76F4\u63A5\u751F\u6210\u5E76\u5E94\u7528\u4E3B\u9898\uFF08\u9700\u5148\u5728 \u8BBE\u7F6E\u2192\u901A\u7528 \u5F00\u542F\u300CAI \u754C\u9762\u63A7\u5236\u300D\uFF09\u3002" }),
      /* @__PURE__ */ jsx10(
        "button",
        {
          type: "button",
          onClick: handleCopy,
          className: "inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary hover:bg-primary/15 transition-colors shrink-0",
          children: copied ? /* @__PURE__ */ jsxs10(Fragment, { children: [
            /* @__PURE__ */ jsx10(Check, { size: 12 }),
            " \u5DF2\u590D\u5236"
          ] }) : /* @__PURE__ */ jsxs10(Fragment, { children: [
            /* @__PURE__ */ jsx10(Copy, { size: 12 }),
            " \u590D\u5236\u5168\u90E8"
          ] })
        }
      )
    ] }),
    /* @__PURE__ */ jsx10("pre", { className: "rounded-lg border border-border-subtle bg-background-elevated p-3 text-[11px] font-mono text-text-tertiary overflow-auto max-h-[500px] whitespace-pre-wrap leading-relaxed", children: guideContent })
  ] });
}

// src/tabs/AdvancedTab.tsx
import { useEffect as useEffect5, useState as useState6 } from "react";

// src/path.ts
var platform = (() => {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  return "linux";
})();

// src/tabs/AdvancedTab.tsx
import { jsx as jsx11, jsxs as jsxs11 } from "react/jsx-runtime";
function AdvancedTab({ config, onConfigChange, loading }) {
  const { t: t2 } = useTranslation("settings");
  const [dataRoot, setDataRoot] = useState6(null);
  useEffect5(() => {
    void getDataRootInfo().then(setDataRoot).catch(() => setDataRoot(null));
  }, []);
  const handleGitBinPathChange = (gitBinPath) => {
    onConfigChange({
      ...config,
      gitBinPath: gitBinPath || void 0
    });
  };
  const handleSessionDirChange = (sessionDir) => {
    onConfigChange({
      ...config,
      sessionDir: sessionDir || void 0
    });
  };
  return /* @__PURE__ */ jsxs11("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs11("div", { className: "p-4 bg-surface rounded-lg border border-border", children: [
      /* @__PURE__ */ jsx11("h3", { className: "text-sm font-medium text-text-primary mb-3", children: t2("advanced.gitConfig") }),
      /* @__PURE__ */ jsxs11("div", { className: "mb-4", children: [
        /* @__PURE__ */ jsx11("label", { className: "block text-xs text-text-secondary mb-2", children: t2("advanced.gitBinPath") }),
        /* @__PURE__ */ jsx11(
          "input",
          {
            type: "text",
            value: config.gitBinPath || "",
            onChange: (e) => handleGitBinPathChange(e.target.value),
            placeholder: t2("advanced.gitBinPathPlaceholder"),
            className: "w-full px-3 py-2 bg-background-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
            disabled: loading
          }
        ),
        /* @__PURE__ */ jsx11("p", { className: "mt-1 text-xs text-text-tertiary", children: t2("advanced.gitBinPathHint") })
      ] })
    ] }),
    /* @__PURE__ */ jsxs11("div", { className: "p-4 bg-surface rounded-lg border border-border", children: [
      /* @__PURE__ */ jsx11("h3", { className: "text-sm font-medium text-text-primary mb-3", children: t2("advanced.sessionConfig") }),
      /* @__PURE__ */ jsxs11("div", { className: "mb-4", children: [
        /* @__PURE__ */ jsx11("label", { className: "block text-xs text-text-secondary mb-2", children: t2("advanced.sessionDir") }),
        /* @__PURE__ */ jsx11(
          "input",
          {
            type: "text",
            value: config.sessionDir || "",
            onChange: (e) => handleSessionDirChange(e.target.value),
            placeholder: t2("advanced.sessionDirPlaceholder"),
            className: "w-full px-3 py-2 bg-background-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
            disabled: loading
          }
        ),
        /* @__PURE__ */ jsx11("p", { className: "mt-1 text-xs text-text-tertiary", children: t2("advanced.sessionDirHint") })
      ] })
    ] }),
    /* @__PURE__ */ jsxs11("div", { className: "p-4 bg-surface rounded-lg border border-border", children: [
      /* @__PURE__ */ jsx11("h3", { className: "text-sm font-medium text-text-primary mb-3", children: t2("advanced.debugInfo") }),
      /* @__PURE__ */ jsxs11("div", { className: "text-xs text-text-tertiary space-y-1", children: [
        /* @__PURE__ */ jsxs11("p", { children: [
          /* @__PURE__ */ jsxs11("span", { className: "text-text-secondary", children: [
            t2("advanced.configFile"),
            "\uFF1A"
          ] }),
          dataRoot ? `${dataRoot.root}${platform === "windows" ? "\\" : "/"}config.json` : platform === "windows" ? "%APPDATA%\\Polaris\\config.json" : "~/.config/Polaris/config.json"
        ] }),
        /* @__PURE__ */ jsxs11("p", { children: [
          /* @__PURE__ */ jsxs11("span", { className: "text-text-secondary", children: [
            t2("advanced.logDir"),
            "\uFF1A"
          ] }),
          dataRoot ? `${dataRoot.root}${platform === "windows" ? "\\" : "/"}logs` : platform === "windows" ? "%APPDATA%\\Polaris\\logs" : "~/.config/Polaris/logs"
        ] }),
        /* @__PURE__ */ jsxs11("p", { children: [
          /* @__PURE__ */ jsxs11("span", { className: "text-text-secondary", children: [
            t2("advanced.currentEngine"),
            "\uFF1A"
          ] }),
          config.defaultEngine
        ] })
      ] })
    ] })
  ] });
}

// src/tabs/AppUpdateTab.tsx
import { useCallback as useCallback2, useEffect as useEffect6, useMemo as useMemo3, useState as useState7 } from "react";
import { jsx as jsx12, jsxs as jsxs12 } from "react/jsx-runtime";
function normalizeVersion(version) {
  return version.replace(/^v/i, "");
}
function formatBytes(value) {
  if (!value) return "";
  const mb = value / 1024 / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}
function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString();
}
var STAGE_LABEL = {
  checking: "\u68C0\u67E5\u66F4\u65B0\u4E2D",
  downloading: "\u4E0B\u8F7D\u4E2D",
  installing: "\u5B89\u88C5\u4E2D",
  completed: "\u5B8C\u6210"
};
function AppUpdateTab() {
  const { t: t2 } = useTranslation("settings");
  const toast = useToastStore();
  const config = useConfigStore((s) => s.config);
  const updateConfigPatch = useConfigStore((s) => s.updateConfigPatch);
  const updateSource = config?.update;
  const [currentVersion, setCurrentVersion] = useState7("unknown");
  const [supported, setSupported] = useState7(false);
  const [isRunning, setIsRunning] = useState7(false);
  const [progress, setProgress] = useState7(null);
  const [releases, setReleases] = useState7([]);
  const [isLoadingReleases, setIsLoadingReleases] = useState7(false);
  const [releaseError, setReleaseError] = useState7(null);
  const canUseUpdater = currentMode2 === "tauri" && supported;
  const progressPercent = useMemo3(() => {
    if (!progress) return null;
    return progress.percent;
  }, [progress]);
  const loadReleases = useCallback2(async () => {
    setIsLoadingReleases(true);
    setReleaseError(null);
    try {
      const result = await listAppReleases();
      setReleases(result);
    } catch (error) {
      const message2 = error instanceof Error ? error.message : String(error);
      setReleaseError(message2);
    } finally {
      setIsLoadingReleases(false);
    }
  }, []);
  useEffect6(() => {
    getUpdateStatus().then((status) => {
      setSupported(status.supported);
      if (status.supported) {
        setCurrentVersion(status.currentVersion);
      }
    });
    const unlisteners = [];
    listenUpdateProgress((p) => setProgress(p)).then((un) => unlisteners.push(un));
    listenUpdateCompleted((p) => {
      setIsRunning(false);
      setProgress(null);
      if (p.updated) {
        toast.success(t2("appUpdate.updateDone"), t2("appUpdate.updateDoneDesc"));
      } else if (p.reason === "error") {
        toast.error(t2("appUpdate.installFailed"), p.error || "");
      } else {
        toast.info(t2("appUpdate.upToDate"), t2("appUpdate.upToDateDesc"));
      }
    }).then((un) => unlisteners.push(un));
    loadReleases();
    return () => {
      unlisteners.forEach((un) => un());
    };
  }, [loadReleases, t2, toast]);
  const handleSaveSource = async (patch) => {
    const merged2 = {
      sourceType: updateSource?.sourceType ?? "github",
      repo: updateSource?.repo ?? "misxzaiz/Polaris",
      localManifestPath: updateSource?.localManifestPath ?? null,
      manifestUrl: updateSource?.manifestUrl ?? null,
      checkOnStartup: updateSource?.checkOnStartup ?? false,
      ...patch
    };
    try {
      await updateConfigPatch({ update: merged2 });
    } catch (error) {
      const message2 = error instanceof Error ? error.message : String(error);
      toast.error(t2("appUpdate.checkFailed"), message2);
    }
  };
  const handleRunUpdate = async () => {
    setIsRunning(true);
    setProgress({ stage: "checking", percent: 0 });
    try {
      await runAutoUpdate();
    } catch (error) {
      const message2 = error instanceof Error ? error.message : String(error);
      toast.error(t2("appUpdate.checkFailed"), message2);
      setIsRunning(false);
      setProgress(null);
    }
  };
  return /* @__PURE__ */ jsxs12("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs12("div", { className: "p-4 bg-surface rounded-lg border border-border", children: [
      /* @__PURE__ */ jsxs12("div", { className: "flex items-start justify-between gap-4", children: [
        /* @__PURE__ */ jsxs12("div", { children: [
          /* @__PURE__ */ jsx12("h3", { className: "text-sm font-medium text-text-primary", children: t2("appUpdate.title") }),
          /* @__PURE__ */ jsx12("p", { className: "text-xs text-text-secondary mt-1", children: t2("appUpdate.description") })
        ] }),
        /* @__PURE__ */ jsx12("span", { className: `text-xs px-2 py-1 rounded ${canUseUpdater ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`, children: canUseUpdater ? t2("appUpdate.desktopAvailable") : t2("appUpdate.desktopOnly") })
      ] }),
      /* @__PURE__ */ jsxs12("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4", children: [
        /* @__PURE__ */ jsxs12("div", { className: "p-3 rounded border border-border-subtle bg-background-surface", children: [
          /* @__PURE__ */ jsx12("div", { className: "text-xs text-text-tertiary", children: t2("appUpdate.currentVersion") }),
          /* @__PURE__ */ jsx12("div", { className: "text-base font-semibold text-text-primary mt-1", children: currentVersion })
        ] }),
        /* @__PURE__ */ jsxs12("div", { className: "p-3 rounded border border-border-subtle bg-background-surface", children: [
          /* @__PURE__ */ jsx12("div", { className: "text-xs text-text-tertiary", children: t2("appUpdate.source") }),
          /* @__PURE__ */ jsxs12(
            "select",
            {
              value: updateSource?.sourceType ?? "github",
              onChange: (e) => handleSaveSource({ sourceType: e.target.value }),
              disabled: !canUseUpdater,
              className: "mt-1 w-full text-sm bg-transparent text-text-primary border border-border-subtle rounded px-1.5 py-0.5 focus:outline-none focus:border-primary",
              children: [
                /* @__PURE__ */ jsx12("option", { value: "github", children: "GitHub Releases" }),
                /* @__PURE__ */ jsx12("option", { value: "local", children: "Local\uFF08\u672C\u5730\u5305\uFF09" }),
                /* @__PURE__ */ jsx12("option", { value: "custom", children: "Custom\uFF08\u81EA\u5EFA\u6E90\uFF09" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs12("div", { className: "p-3 rounded border border-border-subtle bg-background-surface", children: [
          /* @__PURE__ */ jsx12("div", { className: "text-xs text-text-tertiary", children: updateSource?.sourceType === "local" ? t2("appUpdate.localManifestPath") : updateSource?.sourceType === "custom" ? t2("appUpdate.customManifestUrl") : t2("appUpdate.githubRepo") }),
          updateSource?.sourceType === "local" ? /* @__PURE__ */ jsx12(
            "input",
            {
              type: "text",
              value: updateSource?.localManifestPath ?? "",
              onChange: (e) => handleSaveSource({ localManifestPath: e.target.value }),
              placeholder: "D:\\\\dist\\\\latest.json",
              className: "mt-1 w-full text-sm bg-transparent text-text-primary border border-border-subtle rounded px-1.5 py-0.5 focus:outline-none focus:border-primary"
            }
          ) : updateSource?.sourceType === "custom" ? /* @__PURE__ */ jsx12(
            "input",
            {
              type: "text",
              value: updateSource?.manifestUrl ?? "",
              onChange: (e) => handleSaveSource({ manifestUrl: e.target.value }),
              placeholder: "https://host/latest.json",
              className: "mt-1 w-full text-sm bg-transparent text-text-primary border border-border-subtle rounded px-1.5 py-0.5 focus:outline-none focus:border-primary"
            }
          ) : /* @__PURE__ */ jsx12("div", { className: "text-base font-semibold text-text-primary mt-1", children: updateSource?.repo ?? "misxzaiz/Polaris" })
        ] })
      ] }),
      /* @__PURE__ */ jsx12("div", { className: "flex flex-wrap items-center gap-2 mt-4", children: /* @__PURE__ */ jsxs12(
        "button",
        {
          type: "button",
          onClick: handleRunUpdate,
          disabled: !canUseUpdater || isRunning,
          className: "inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed",
          children: [
            isRunning ? /* @__PURE__ */ jsx12(LoaderCircle, { size: 14, className: "animate-spin" }) : /* @__PURE__ */ jsx12(Download, { size: 14 }),
            t2("appUpdate.checkAndInstall")
          ]
        }
      ) }),
      progressPercent !== null && /* @__PURE__ */ jsxs12("div", { className: "mt-4", children: [
        /* @__PURE__ */ jsxs12("div", { className: "flex items-center justify-between text-xs text-text-tertiary mb-1", children: [
          /* @__PURE__ */ jsxs12("span", { children: [
            STAGE_LABEL[progress?.stage ?? "checking"],
            progress?.version ? ` \xB7 v${progress.version}` : ""
          ] }),
          /* @__PURE__ */ jsx12("span", { children: progress?.stage === "installing" ? "" : `${progressPercent}%` })
        ] }),
        /* @__PURE__ */ jsx12("div", { className: "h-2 rounded-full bg-background-hover overflow-hidden", children: /* @__PURE__ */ jsx12("div", { className: "h-full bg-primary transition-all", style: { width: `${progressPercent}%` } }) })
      ] }),
      /* @__PURE__ */ jsxs12("div", { className: "mt-4 p-3 rounded bg-warning/10 text-warning text-xs flex gap-2", children: [
        /* @__PURE__ */ jsx12(TriangleAlert, { size: 15, className: "shrink-0 mt-0.5" }),
        /* @__PURE__ */ jsx12("span", { children: t2("appUpdate.autoUpdateNote") })
      ] })
    ] }),
    /* @__PURE__ */ jsxs12("div", { className: "p-4 bg-surface rounded-lg border border-border", children: [
      /* @__PURE__ */ jsxs12("div", { className: "flex items-center justify-between gap-3 mb-3", children: [
        /* @__PURE__ */ jsxs12("div", { children: [
          /* @__PURE__ */ jsx12("h3", { className: "text-sm font-medium text-text-primary", children: t2("appUpdate.historyTitle") }),
          /* @__PURE__ */ jsx12("p", { className: "text-xs text-text-secondary mt-1", children: t2("appUpdate.historyDesc") })
        ] }),
        /* @__PURE__ */ jsx12(
          "button",
          {
            type: "button",
            onClick: loadReleases,
            disabled: isLoadingReleases,
            className: "p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-background-hover disabled:opacity-50",
            title: t2("appUpdate.refreshReleases"),
            children: /* @__PURE__ */ jsx12(RefreshCw, { size: 15, className: isLoadingReleases ? "animate-spin" : "" })
          }
        )
      ] }),
      releaseError && /* @__PURE__ */ jsx12("div", { className: "mb-3 p-3 rounded bg-danger/10 text-danger text-xs", children: releaseError }),
      /* @__PURE__ */ jsx12("div", { className: "divide-y divide-border-subtle", children: isLoadingReleases && releases.length === 0 ? /* @__PURE__ */ jsx12("div", { className: "py-6 flex items-center justify-center text-text-tertiary", children: /* @__PURE__ */ jsx12(LoaderCircle, { size: 18, className: "animate-spin" }) }) : releases.length === 0 ? /* @__PURE__ */ jsx12("div", { className: "py-6 text-center text-sm text-text-tertiary", children: t2("appUpdate.noReleases") }) : releases.map((release) => {
        const isCurrent = normalizeVersion(release.tagName) === normalizeVersion(currentVersion);
        return /* @__PURE__ */ jsxs12("div", { className: "py-3 flex items-start justify-between gap-3", children: [
          /* @__PURE__ */ jsxs12("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsxs12("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx12("span", { className: "font-mono text-sm font-medium text-text-primary", children: release.tagName }),
              isCurrent && /* @__PURE__ */ jsxs12("span", { className: "inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-success/10 text-success", children: [
                /* @__PURE__ */ jsx12(CircleCheck, { size: 11 }),
                t2("appUpdate.current")
              ] }),
              release.prerelease && /* @__PURE__ */ jsx12("span", { className: "text-[11px] px-1.5 py-0.5 rounded bg-warning/10 text-warning", children: t2("appUpdate.prerelease") })
            ] }),
            /* @__PURE__ */ jsxs12("div", { className: "text-xs text-text-tertiary mt-1", children: [
              formatDate(release.publishedAt),
              release.msiAsset && ` \xB7 ${release.msiAsset.name} ${formatBytes(release.msiAsset.size)}`
            ] })
          ] }),
          /* @__PURE__ */ jsxs12("div", { className: "flex items-center gap-2 shrink-0", children: [
            release.msiAsset && /* @__PURE__ */ jsxs12(
              ExternalLink,
              {
                href: release.msiAsset.downloadUrl,
                className: "inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-background-hover",
                children: [
                  /* @__PURE__ */ jsx12(Download, { size: 12 }),
                  isCurrent ? t2("appUpdate.download") : t2("appUpdate.downloadMsi")
                ]
              }
            ),
            /* @__PURE__ */ jsxs12(
              ExternalLink,
              {
                href: release.htmlUrl,
                className: "inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-background-hover",
                children: [
                  /* @__PURE__ */ jsx12(Download, { size: 12 }),
                  t2("appUpdate.openRelease")
                ]
              }
            )
          ] })
        ] }, release.tagName);
      }) }),
      /* @__PURE__ */ jsxs12("div", { className: "mt-4 p-3 rounded bg-warning/10 text-warning text-xs flex gap-2", children: [
        /* @__PURE__ */ jsx12(TriangleAlert, { size: 15, className: "shrink-0 mt-0.5" }),
        /* @__PURE__ */ jsx12("span", { children: t2("appUpdate.rollbackWarning") })
      ] })
    ] })
  ] });
}

// src/tabs/WebTab.tsx
import { useState as useState8, useEffect as useEffect7, useMemo as useMemo4 } from "react";

// node_modules/react-qr-code/lib/index.mjs
var import_prop_types = __toESM(require_prop_types(), 1);

// node_modules/qrcode-generator/dist/qrcode.mjs
var qrcode = function(typeNumber, errorCorrectionLevel) {
  const PAD0 = 236;
  const PAD1 = 17;
  let _typeNumber = typeNumber;
  const _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
  let _modules = null;
  let _moduleCount = 0;
  let _dataCache = null;
  const _dataList = [];
  const _this = {};
  const makeImpl = function(test, maskPattern) {
    _moduleCount = _typeNumber * 4 + 17;
    _modules = function(moduleCount) {
      const modules = new Array(moduleCount);
      for (let row = 0; row < moduleCount; row += 1) {
        modules[row] = new Array(moduleCount);
        for (let col = 0; col < moduleCount; col += 1) {
          modules[row][col] = null;
        }
      }
      return modules;
    }(_moduleCount);
    setupPositionProbePattern(0, 0);
    setupPositionProbePattern(_moduleCount - 7, 0);
    setupPositionProbePattern(0, _moduleCount - 7);
    setupPositionAdjustPattern();
    setupTimingPattern();
    setupTypeInfo(test, maskPattern);
    if (_typeNumber >= 7) {
      setupTypeNumber(test);
    }
    if (_dataCache == null) {
      _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
    }
    mapData(_dataCache, maskPattern);
  };
  const setupPositionProbePattern = function(row, col) {
    for (let r = -1; r <= 7; r += 1) {
      if (row + r <= -1 || _moduleCount <= row + r) continue;
      for (let c = -1; c <= 7; c += 1) {
        if (col + c <= -1 || _moduleCount <= col + c) continue;
        if (0 <= r && r <= 6 && (c == 0 || c == 6) || 0 <= c && c <= 6 && (r == 0 || r == 6) || 2 <= r && r <= 4 && 2 <= c && c <= 4) {
          _modules[row + r][col + c] = true;
        } else {
          _modules[row + r][col + c] = false;
        }
      }
    }
  };
  const getBestMaskPattern = function() {
    let minLostPoint = 0;
    let pattern = 0;
    for (let i = 0; i < 8; i += 1) {
      makeImpl(true, i);
      const lostPoint = QRUtil.getLostPoint(_this);
      if (i == 0 || minLostPoint > lostPoint) {
        minLostPoint = lostPoint;
        pattern = i;
      }
    }
    return pattern;
  };
  const setupTimingPattern = function() {
    for (let r = 8; r < _moduleCount - 8; r += 1) {
      if (_modules[r][6] != null) {
        continue;
      }
      _modules[r][6] = r % 2 == 0;
    }
    for (let c = 8; c < _moduleCount - 8; c += 1) {
      if (_modules[6][c] != null) {
        continue;
      }
      _modules[6][c] = c % 2 == 0;
    }
  };
  const setupPositionAdjustPattern = function() {
    const pos = QRUtil.getPatternPosition(_typeNumber);
    for (let i = 0; i < pos.length; i += 1) {
      for (let j = 0; j < pos.length; j += 1) {
        const row = pos[i];
        const col = pos[j];
        if (_modules[row][col] != null) {
          continue;
        }
        for (let r = -2; r <= 2; r += 1) {
          for (let c = -2; c <= 2; c += 1) {
            if (r == -2 || r == 2 || c == -2 || c == 2 || r == 0 && c == 0) {
              _modules[row + r][col + c] = true;
            } else {
              _modules[row + r][col + c] = false;
            }
          }
        }
      }
    }
  };
  const setupTypeNumber = function(test) {
    const bits = QRUtil.getBCHTypeNumber(_typeNumber);
    for (let i = 0; i < 18; i += 1) {
      const mod = !test && (bits >> i & 1) == 1;
      _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
    }
    for (let i = 0; i < 18; i += 1) {
      const mod = !test && (bits >> i & 1) == 1;
      _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
    }
  };
  const setupTypeInfo = function(test, maskPattern) {
    const data = _errorCorrectionLevel << 3 | maskPattern;
    const bits = QRUtil.getBCHTypeInfo(data);
    for (let i = 0; i < 15; i += 1) {
      const mod = !test && (bits >> i & 1) == 1;
      if (i < 6) {
        _modules[i][8] = mod;
      } else if (i < 8) {
        _modules[i + 1][8] = mod;
      } else {
        _modules[_moduleCount - 15 + i][8] = mod;
      }
    }
    for (let i = 0; i < 15; i += 1) {
      const mod = !test && (bits >> i & 1) == 1;
      if (i < 8) {
        _modules[8][_moduleCount - i - 1] = mod;
      } else if (i < 9) {
        _modules[8][15 - i - 1 + 1] = mod;
      } else {
        _modules[8][15 - i - 1] = mod;
      }
    }
    _modules[_moduleCount - 8][8] = !test;
  };
  const mapData = function(data, maskPattern) {
    let inc = -1;
    let row = _moduleCount - 1;
    let bitIndex = 7;
    let byteIndex = 0;
    const maskFunc = QRUtil.getMaskFunction(maskPattern);
    for (let col = _moduleCount - 1; col > 0; col -= 2) {
      if (col == 6) col -= 1;
      while (true) {
        for (let c = 0; c < 2; c += 1) {
          if (_modules[row][col - c] == null) {
            let dark = false;
            if (byteIndex < data.length) {
              dark = (data[byteIndex] >>> bitIndex & 1) == 1;
            }
            const mask = maskFunc(row, col - c);
            if (mask) {
              dark = !dark;
            }
            _modules[row][col - c] = dark;
            bitIndex -= 1;
            if (bitIndex == -1) {
              byteIndex += 1;
              bitIndex = 7;
            }
          }
        }
        row += inc;
        if (row < 0 || _moduleCount <= row) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }
  };
  const createBytes = function(buffer, rsBlocks) {
    let offset = 0;
    let maxDcCount = 0;
    let maxEcCount = 0;
    const dcdata = new Array(rsBlocks.length);
    const ecdata = new Array(rsBlocks.length);
    for (let r = 0; r < rsBlocks.length; r += 1) {
      const dcCount = rsBlocks[r].dataCount;
      const ecCount = rsBlocks[r].totalCount - dcCount;
      maxDcCount = Math.max(maxDcCount, dcCount);
      maxEcCount = Math.max(maxEcCount, ecCount);
      dcdata[r] = new Array(dcCount);
      for (let i = 0; i < dcdata[r].length; i += 1) {
        dcdata[r][i] = 255 & buffer.getBuffer()[i + offset];
      }
      offset += dcCount;
      const rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
      const rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);
      const modPoly = rawPoly.mod(rsPoly);
      ecdata[r] = new Array(rsPoly.getLength() - 1);
      for (let i = 0; i < ecdata[r].length; i += 1) {
        const modIndex = i + modPoly.getLength() - ecdata[r].length;
        ecdata[r][i] = modIndex >= 0 ? modPoly.getAt(modIndex) : 0;
      }
    }
    let totalCodeCount = 0;
    for (let i = 0; i < rsBlocks.length; i += 1) {
      totalCodeCount += rsBlocks[i].totalCount;
    }
    const data = new Array(totalCodeCount);
    let index = 0;
    for (let i = 0; i < maxDcCount; i += 1) {
      for (let r = 0; r < rsBlocks.length; r += 1) {
        if (i < dcdata[r].length) {
          data[index] = dcdata[r][i];
          index += 1;
        }
      }
    }
    for (let i = 0; i < maxEcCount; i += 1) {
      for (let r = 0; r < rsBlocks.length; r += 1) {
        if (i < ecdata[r].length) {
          data[index] = ecdata[r][i];
          index += 1;
        }
      }
    }
    return data;
  };
  const createData = function(typeNumber2, errorCorrectionLevel2, dataList) {
    const rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, errorCorrectionLevel2);
    const buffer = qrBitBuffer();
    for (let i = 0; i < dataList.length; i += 1) {
      const data = dataList[i];
      buffer.put(data.getMode(), 4);
      buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
      data.write(buffer);
    }
    let totalDataCount = 0;
    for (let i = 0; i < rsBlocks.length; i += 1) {
      totalDataCount += rsBlocks[i].dataCount;
    }
    if (buffer.getLengthInBits() > totalDataCount * 8) {
      throw "code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")";
    }
    if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
      buffer.put(0, 4);
    }
    while (buffer.getLengthInBits() % 8 != 0) {
      buffer.putBit(false);
    }
    while (true) {
      if (buffer.getLengthInBits() >= totalDataCount * 8) {
        break;
      }
      buffer.put(PAD0, 8);
      if (buffer.getLengthInBits() >= totalDataCount * 8) {
        break;
      }
      buffer.put(PAD1, 8);
    }
    return createBytes(buffer, rsBlocks);
  };
  _this.addData = function(data, mode2) {
    mode2 = mode2 || "Byte";
    let newData = null;
    switch (mode2) {
      case "Numeric":
        newData = qrNumber(data);
        break;
      case "Alphanumeric":
        newData = qrAlphaNum(data);
        break;
      case "Byte":
        newData = qr8BitByte(data);
        break;
      case "Kanji":
        newData = qrKanji(data);
        break;
      default:
        throw "mode:" + mode2;
    }
    _dataList.push(newData);
    _dataCache = null;
  };
  _this.isDark = function(row, col) {
    if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
      throw row + "," + col;
    }
    return _modules[row][col];
  };
  _this.getModuleCount = function() {
    return _moduleCount;
  };
  _this.make = function() {
    if (_typeNumber < 1) {
      let typeNumber2 = 1;
      for (; typeNumber2 < 40; typeNumber2++) {
        const rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, _errorCorrectionLevel);
        const buffer = qrBitBuffer();
        for (let i = 0; i < _dataList.length; i++) {
          const data = _dataList[i];
          buffer.put(data.getMode(), 4);
          buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
          data.write(buffer);
        }
        let totalDataCount = 0;
        for (let i = 0; i < rsBlocks.length; i++) {
          totalDataCount += rsBlocks[i].dataCount;
        }
        if (buffer.getLengthInBits() <= totalDataCount * 8) {
          break;
        }
      }
      _typeNumber = typeNumber2;
    }
    makeImpl(false, getBestMaskPattern());
  };
  _this.createTableTag = function(cellSize, margin) {
    cellSize = cellSize || 2;
    margin = typeof margin == "undefined" ? cellSize * 4 : margin;
    let qrHtml = "";
    qrHtml += '<table style="';
    qrHtml += " border-width: 0px; border-style: none;";
    qrHtml += " border-collapse: collapse;";
    qrHtml += " padding: 0px; margin: " + margin + "px;";
    qrHtml += '">';
    qrHtml += "<tbody>";
    for (let r = 0; r < _this.getModuleCount(); r += 1) {
      qrHtml += "<tr>";
      for (let c = 0; c < _this.getModuleCount(); c += 1) {
        qrHtml += '<td style="';
        qrHtml += " border-width: 0px; border-style: none;";
        qrHtml += " border-collapse: collapse;";
        qrHtml += " padding: 0px; margin: 0px;";
        qrHtml += " width: " + cellSize + "px;";
        qrHtml += " height: " + cellSize + "px;";
        qrHtml += " background-color: ";
        qrHtml += _this.isDark(r, c) ? "#000000" : "#ffffff";
        qrHtml += ";";
        qrHtml += '"/>';
      }
      qrHtml += "</tr>";
    }
    qrHtml += "</tbody>";
    qrHtml += "</table>";
    return qrHtml;
  };
  _this.createSvgTag = function(cellSize, margin, alt, title) {
    let opts = {};
    if (typeof arguments[0] == "object") {
      opts = arguments[0];
      cellSize = opts.cellSize;
      margin = opts.margin;
      alt = opts.alt;
      title = opts.title;
    }
    cellSize = cellSize || 2;
    margin = typeof margin == "undefined" ? cellSize * 4 : margin;
    alt = typeof alt === "string" ? { text: alt } : alt || {};
    alt.text = alt.text || null;
    alt.id = alt.text ? alt.id || "qrcode-description" : null;
    title = typeof title === "string" ? { text: title } : title || {};
    title.text = title.text || null;
    title.id = title.text ? title.id || "qrcode-title" : null;
    const size = _this.getModuleCount() * cellSize + margin * 2;
    let c, mc, r, mr, qrSvg = "", rect;
    rect = "l" + cellSize + ",0 0," + cellSize + " -" + cellSize + ",0 0,-" + cellSize + "z ";
    qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
    qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : "";
    qrSvg += ' viewBox="0 0 ' + size + " " + size + '" ';
    qrSvg += ' preserveAspectRatio="xMinYMin meet"';
    qrSvg += title.text || alt.text ? ' role="img" aria-labelledby="' + escapeXml([title.id, alt.id].join(" ").trim()) + '"' : "";
    qrSvg += ">";
    qrSvg += title.text ? '<title id="' + escapeXml(title.id) + '">' + escapeXml(title.text) + "</title>" : "";
    qrSvg += alt.text ? '<description id="' + escapeXml(alt.id) + '">' + escapeXml(alt.text) + "</description>" : "";
    qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
    qrSvg += '<path d="';
    for (r = 0; r < _this.getModuleCount(); r += 1) {
      mr = r * cellSize + margin;
      for (c = 0; c < _this.getModuleCount(); c += 1) {
        if (_this.isDark(r, c)) {
          mc = c * cellSize + margin;
          qrSvg += "M" + mc + "," + mr + rect;
        }
      }
    }
    qrSvg += '" stroke="transparent" fill="black"/>';
    qrSvg += "</svg>";
    return qrSvg;
  };
  _this.createDataURL = function(cellSize, margin) {
    cellSize = cellSize || 2;
    margin = typeof margin == "undefined" ? cellSize * 4 : margin;
    const size = _this.getModuleCount() * cellSize + margin * 2;
    const min = margin;
    const max = size - margin;
    return createDataURL(size, size, function(x, y) {
      if (min <= x && x < max && min <= y && y < max) {
        const c = Math.floor((x - min) / cellSize);
        const r = Math.floor((y - min) / cellSize);
        return _this.isDark(r, c) ? 0 : 1;
      } else {
        return 1;
      }
    });
  };
  _this.createImgTag = function(cellSize, margin, alt) {
    cellSize = cellSize || 2;
    margin = typeof margin == "undefined" ? cellSize * 4 : margin;
    const size = _this.getModuleCount() * cellSize + margin * 2;
    let img = "";
    img += "<img";
    img += ' src="';
    img += _this.createDataURL(cellSize, margin);
    img += '"';
    img += ' width="';
    img += size;
    img += '"';
    img += ' height="';
    img += size;
    img += '"';
    if (alt) {
      img += ' alt="';
      img += escapeXml(alt);
      img += '"';
    }
    img += "/>";
    return img;
  };
  const escapeXml = function(s) {
    let escaped = "";
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charAt(i);
      switch (c) {
        case "<":
          escaped += "&lt;";
          break;
        case ">":
          escaped += "&gt;";
          break;
        case "&":
          escaped += "&amp;";
          break;
        case '"':
          escaped += "&quot;";
          break;
        default:
          escaped += c;
          break;
      }
    }
    return escaped;
  };
  const _createHalfASCII = function(margin) {
    const cellSize = 1;
    margin = typeof margin == "undefined" ? cellSize * 2 : margin;
    const size = _this.getModuleCount() * cellSize + margin * 2;
    const min = margin;
    const max = size - margin;
    let y, x, r1, r2, p;
    const blocks = {
      "\u2588\u2588": "\u2588",
      "\u2588 ": "\u2580",
      " \u2588": "\u2584",
      "  ": " "
    };
    const blocksLastLineNoMargin = {
      "\u2588\u2588": "\u2580",
      "\u2588 ": "\u2580",
      " \u2588": " ",
      "  ": " "
    };
    let ascii = "";
    for (y = 0; y < size; y += 2) {
      r1 = Math.floor((y - min) / cellSize);
      r2 = Math.floor((y + 1 - min) / cellSize);
      for (x = 0; x < size; x += 1) {
        p = "\u2588";
        if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
          p = " ";
        }
        if (min <= x && x < max && min <= y + 1 && y + 1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
          p += " ";
        } else {
          p += "\u2588";
        }
        ascii += margin < 1 && y + 1 >= max ? blocksLastLineNoMargin[p] : blocks[p];
      }
      ascii += "\n";
    }
    if (size % 2 && margin > 0) {
      return ascii.substring(0, ascii.length - size - 1) + Array(size + 1).join("\u2580");
    }
    return ascii.substring(0, ascii.length - 1);
  };
  _this.createASCII = function(cellSize, margin) {
    cellSize = cellSize || 1;
    if (cellSize < 2) {
      return _createHalfASCII(margin);
    }
    cellSize -= 1;
    margin = typeof margin == "undefined" ? cellSize * 2 : margin;
    const size = _this.getModuleCount() * cellSize + margin * 2;
    const min = margin;
    const max = size - margin;
    let y, x, r, p;
    const white = Array(cellSize + 1).join("\u2588\u2588");
    const black = Array(cellSize + 1).join("  ");
    let ascii = "";
    let line = "";
    for (y = 0; y < size; y += 1) {
      r = Math.floor((y - min) / cellSize);
      line = "";
      for (x = 0; x < size; x += 1) {
        p = 1;
        if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
          p = 0;
        }
        line += p ? white : black;
      }
      for (r = 0; r < cellSize; r += 1) {
        ascii += line + "\n";
      }
    }
    return ascii.substring(0, ascii.length - 1);
  };
  _this.renderTo2dContext = function(context, cellSize) {
    cellSize = cellSize || 2;
    const length = _this.getModuleCount();
    for (let row = 0; row < length; row++) {
      for (let col = 0; col < length; col++) {
        context.fillStyle = _this.isDark(row, col) ? "black" : "white";
        context.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
  };
  return _this;
};
qrcode.stringToBytes = function(s) {
  const bytes = [];
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    bytes.push(c & 255);
  }
  return bytes;
};
qrcode.createStringToBytes = function(unicodeData, numChars) {
  const unicodeMap = function() {
    const bin = base64DecodeInputStream(unicodeData);
    const read = function() {
      const b = bin.read();
      if (b == -1) throw "eof";
      return b;
    };
    let count = 0;
    const unicodeMap2 = {};
    while (true) {
      const b0 = bin.read();
      if (b0 == -1) break;
      const b1 = read();
      const b2 = read();
      const b3 = read();
      const k = String.fromCharCode(b0 << 8 | b1);
      const v = b2 << 8 | b3;
      unicodeMap2[k] = v;
      count += 1;
    }
    if (count != numChars) {
      throw count + " != " + numChars;
    }
    return unicodeMap2;
  }();
  const unknownChar = "?".charCodeAt(0);
  return function(s) {
    const bytes = [];
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charCodeAt(i);
      if (c < 128) {
        bytes.push(c);
      } else {
        const b = unicodeMap[s.charAt(i)];
        if (typeof b == "number") {
          if ((b & 255) == b) {
            bytes.push(b);
          } else {
            bytes.push(b >>> 8);
            bytes.push(b & 255);
          }
        } else {
          bytes.push(unknownChar);
        }
      }
    }
    return bytes;
  };
};
var QRMode = {
  MODE_NUMBER: 1 << 0,
  MODE_ALPHA_NUM: 1 << 1,
  MODE_8BIT_BYTE: 1 << 2,
  MODE_KANJI: 1 << 3
};
var QRErrorCorrectionLevel = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2
};
var QRMaskPattern = {
  PATTERN000: 0,
  PATTERN001: 1,
  PATTERN010: 2,
  PATTERN011: 3,
  PATTERN100: 4,
  PATTERN101: 5,
  PATTERN110: 6,
  PATTERN111: 7
};
var QRUtil = function() {
  const PATTERN_POSITION_TABLE = [
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
    [6, 30, 54],
    [6, 32, 58],
    [6, 34, 62],
    [6, 26, 46, 66],
    [6, 26, 48, 70],
    [6, 26, 50, 74],
    [6, 30, 54, 78],
    [6, 30, 56, 82],
    [6, 30, 58, 86],
    [6, 34, 62, 90],
    [6, 28, 50, 72, 94],
    [6, 26, 50, 74, 98],
    [6, 30, 54, 78, 102],
    [6, 28, 54, 80, 106],
    [6, 32, 58, 84, 110],
    [6, 30, 58, 86, 114],
    [6, 34, 62, 90, 118],
    [6, 26, 50, 74, 98, 122],
    [6, 30, 54, 78, 102, 126],
    [6, 26, 52, 78, 104, 130],
    [6, 30, 56, 82, 108, 134],
    [6, 34, 60, 86, 112, 138],
    [6, 30, 58, 86, 114, 142],
    [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150],
    [6, 24, 50, 76, 102, 128, 154],
    [6, 28, 54, 80, 106, 132, 158],
    [6, 32, 58, 84, 110, 136, 162],
    [6, 26, 54, 82, 110, 138, 166],
    [6, 30, 58, 86, 114, 142, 170]
  ];
  const G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
  const G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
  const G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
  const _this = {};
  const getBCHDigit = function(data) {
    let digit = 0;
    while (data != 0) {
      digit += 1;
      data >>>= 1;
    }
    return digit;
  };
  _this.getBCHTypeInfo = function(data) {
    let d = data << 10;
    while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
      d ^= G15 << getBCHDigit(d) - getBCHDigit(G15);
    }
    return (data << 10 | d) ^ G15_MASK;
  };
  _this.getBCHTypeNumber = function(data) {
    let d = data << 12;
    while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
      d ^= G18 << getBCHDigit(d) - getBCHDigit(G18);
    }
    return data << 12 | d;
  };
  _this.getPatternPosition = function(typeNumber) {
    return PATTERN_POSITION_TABLE[typeNumber - 1];
  };
  _this.getMaskFunction = function(maskPattern) {
    switch (maskPattern) {
      case QRMaskPattern.PATTERN000:
        return function(i, j) {
          return (i + j) % 2 == 0;
        };
      case QRMaskPattern.PATTERN001:
        return function(i, j) {
          return i % 2 == 0;
        };
      case QRMaskPattern.PATTERN010:
        return function(i, j) {
          return j % 3 == 0;
        };
      case QRMaskPattern.PATTERN011:
        return function(i, j) {
          return (i + j) % 3 == 0;
        };
      case QRMaskPattern.PATTERN100:
        return function(i, j) {
          return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
        };
      case QRMaskPattern.PATTERN101:
        return function(i, j) {
          return i * j % 2 + i * j % 3 == 0;
        };
      case QRMaskPattern.PATTERN110:
        return function(i, j) {
          return (i * j % 2 + i * j % 3) % 2 == 0;
        };
      case QRMaskPattern.PATTERN111:
        return function(i, j) {
          return (i * j % 3 + (i + j) % 2) % 2 == 0;
        };
      default:
        throw "bad maskPattern:" + maskPattern;
    }
  };
  _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
    let a = qrPolynomial([1], 0);
    for (let i = 0; i < errorCorrectLength; i += 1) {
      a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0));
    }
    return a;
  };
  _this.getLengthInBits = function(mode2, type) {
    if (1 <= type && type < 10) {
      switch (mode2) {
        case QRMode.MODE_NUMBER:
          return 10;
        case QRMode.MODE_ALPHA_NUM:
          return 9;
        case QRMode.MODE_8BIT_BYTE:
          return 8;
        case QRMode.MODE_KANJI:
          return 8;
        default:
          throw "mode:" + mode2;
      }
    } else if (type < 27) {
      switch (mode2) {
        case QRMode.MODE_NUMBER:
          return 12;
        case QRMode.MODE_ALPHA_NUM:
          return 11;
        case QRMode.MODE_8BIT_BYTE:
          return 16;
        case QRMode.MODE_KANJI:
          return 10;
        default:
          throw "mode:" + mode2;
      }
    } else if (type < 41) {
      switch (mode2) {
        case QRMode.MODE_NUMBER:
          return 14;
        case QRMode.MODE_ALPHA_NUM:
          return 13;
        case QRMode.MODE_8BIT_BYTE:
          return 16;
        case QRMode.MODE_KANJI:
          return 12;
        default:
          throw "mode:" + mode2;
      }
    } else {
      throw "type:" + type;
    }
  };
  _this.getLostPoint = function(qrcode2) {
    const moduleCount = qrcode2.getModuleCount();
    let lostPoint = 0;
    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount; col += 1) {
        let sameCount = 0;
        const dark = qrcode2.isDark(row, col);
        for (let r = -1; r <= 1; r += 1) {
          if (row + r < 0 || moduleCount <= row + r) {
            continue;
          }
          for (let c = -1; c <= 1; c += 1) {
            if (col + c < 0 || moduleCount <= col + c) {
              continue;
            }
            if (r == 0 && c == 0) {
              continue;
            }
            if (dark == qrcode2.isDark(row + r, col + c)) {
              sameCount += 1;
            }
          }
        }
        if (sameCount > 5) {
          lostPoint += 3 + sameCount - 5;
        }
      }
    }
    ;
    for (let row = 0; row < moduleCount - 1; row += 1) {
      for (let col = 0; col < moduleCount - 1; col += 1) {
        let count = 0;
        if (qrcode2.isDark(row, col)) count += 1;
        if (qrcode2.isDark(row + 1, col)) count += 1;
        if (qrcode2.isDark(row, col + 1)) count += 1;
        if (qrcode2.isDark(row + 1, col + 1)) count += 1;
        if (count == 0 || count == 4) {
          lostPoint += 3;
        }
      }
    }
    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount - 6; col += 1) {
        if (qrcode2.isDark(row, col) && !qrcode2.isDark(row, col + 1) && qrcode2.isDark(row, col + 2) && qrcode2.isDark(row, col + 3) && qrcode2.isDark(row, col + 4) && !qrcode2.isDark(row, col + 5) && qrcode2.isDark(row, col + 6)) {
          lostPoint += 40;
        }
      }
    }
    for (let col = 0; col < moduleCount; col += 1) {
      for (let row = 0; row < moduleCount - 6; row += 1) {
        if (qrcode2.isDark(row, col) && !qrcode2.isDark(row + 1, col) && qrcode2.isDark(row + 2, col) && qrcode2.isDark(row + 3, col) && qrcode2.isDark(row + 4, col) && !qrcode2.isDark(row + 5, col) && qrcode2.isDark(row + 6, col)) {
          lostPoint += 40;
        }
      }
    }
    let darkCount = 0;
    for (let col = 0; col < moduleCount; col += 1) {
      for (let row = 0; row < moduleCount; row += 1) {
        if (qrcode2.isDark(row, col)) {
          darkCount += 1;
        }
      }
    }
    const ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
    lostPoint += ratio * 10;
    return lostPoint;
  };
  return _this;
}();
var QRMath = function() {
  const EXP_TABLE = new Array(256);
  const LOG_TABLE = new Array(256);
  for (let i = 0; i < 8; i += 1) {
    EXP_TABLE[i] = 1 << i;
  }
  for (let i = 8; i < 256; i += 1) {
    EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
  }
  for (let i = 0; i < 255; i += 1) {
    LOG_TABLE[EXP_TABLE[i]] = i;
  }
  const _this = {};
  _this.glog = function(n) {
    if (n < 1) {
      throw "glog(" + n + ")";
    }
    return LOG_TABLE[n];
  };
  _this.gexp = function(n) {
    while (n < 0) {
      n += 255;
    }
    while (n >= 256) {
      n -= 255;
    }
    return EXP_TABLE[n];
  };
  return _this;
}();
var qrPolynomial = function(num, shift) {
  if (typeof num.length == "undefined") {
    throw num.length + "/" + shift;
  }
  const _num = function() {
    let offset = 0;
    while (offset < num.length && num[offset] == 0) {
      offset += 1;
    }
    const _num2 = new Array(num.length - offset + shift);
    for (let i = 0; i < num.length - offset; i += 1) {
      _num2[i] = num[i + offset];
    }
    return _num2;
  }();
  const _this = {};
  _this.getAt = function(index) {
    return _num[index];
  };
  _this.getLength = function() {
    return _num.length;
  };
  _this.multiply = function(e) {
    const num2 = new Array(_this.getLength() + e.getLength() - 1);
    for (let i = 0; i < _this.getLength(); i += 1) {
      for (let j = 0; j < e.getLength(); j += 1) {
        num2[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i)) + QRMath.glog(e.getAt(j)));
      }
    }
    return qrPolynomial(num2, 0);
  };
  _this.mod = function(e) {
    if (_this.getLength() - e.getLength() < 0) {
      return _this;
    }
    const ratio = QRMath.glog(_this.getAt(0)) - QRMath.glog(e.getAt(0));
    const num2 = new Array(_this.getLength());
    for (let i = 0; i < _this.getLength(); i += 1) {
      num2[i] = _this.getAt(i);
    }
    for (let i = 0; i < e.getLength(); i += 1) {
      num2[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i)) + ratio);
    }
    return qrPolynomial(num2, 0).mod(e);
  };
  return _this;
};
var QRRSBlock = function() {
  const RS_BLOCK_TABLE = [
    // L
    // M
    // Q
    // H
    // 1
    [1, 26, 19],
    [1, 26, 16],
    [1, 26, 13],
    [1, 26, 9],
    // 2
    [1, 44, 34],
    [1, 44, 28],
    [1, 44, 22],
    [1, 44, 16],
    // 3
    [1, 70, 55],
    [1, 70, 44],
    [2, 35, 17],
    [2, 35, 13],
    // 4
    [1, 100, 80],
    [2, 50, 32],
    [2, 50, 24],
    [4, 25, 9],
    // 5
    [1, 134, 108],
    [2, 67, 43],
    [2, 33, 15, 2, 34, 16],
    [2, 33, 11, 2, 34, 12],
    // 6
    [2, 86, 68],
    [4, 43, 27],
    [4, 43, 19],
    [4, 43, 15],
    // 7
    [2, 98, 78],
    [4, 49, 31],
    [2, 32, 14, 4, 33, 15],
    [4, 39, 13, 1, 40, 14],
    // 8
    [2, 121, 97],
    [2, 60, 38, 2, 61, 39],
    [4, 40, 18, 2, 41, 19],
    [4, 40, 14, 2, 41, 15],
    // 9
    [2, 146, 116],
    [3, 58, 36, 2, 59, 37],
    [4, 36, 16, 4, 37, 17],
    [4, 36, 12, 4, 37, 13],
    // 10
    [2, 86, 68, 2, 87, 69],
    [4, 69, 43, 1, 70, 44],
    [6, 43, 19, 2, 44, 20],
    [6, 43, 15, 2, 44, 16],
    // 11
    [4, 101, 81],
    [1, 80, 50, 4, 81, 51],
    [4, 50, 22, 4, 51, 23],
    [3, 36, 12, 8, 37, 13],
    // 12
    [2, 116, 92, 2, 117, 93],
    [6, 58, 36, 2, 59, 37],
    [4, 46, 20, 6, 47, 21],
    [7, 42, 14, 4, 43, 15],
    // 13
    [4, 133, 107],
    [8, 59, 37, 1, 60, 38],
    [8, 44, 20, 4, 45, 21],
    [12, 33, 11, 4, 34, 12],
    // 14
    [3, 145, 115, 1, 146, 116],
    [4, 64, 40, 5, 65, 41],
    [11, 36, 16, 5, 37, 17],
    [11, 36, 12, 5, 37, 13],
    // 15
    [5, 109, 87, 1, 110, 88],
    [5, 65, 41, 5, 66, 42],
    [5, 54, 24, 7, 55, 25],
    [11, 36, 12, 7, 37, 13],
    // 16
    [5, 122, 98, 1, 123, 99],
    [7, 73, 45, 3, 74, 46],
    [15, 43, 19, 2, 44, 20],
    [3, 45, 15, 13, 46, 16],
    // 17
    [1, 135, 107, 5, 136, 108],
    [10, 74, 46, 1, 75, 47],
    [1, 50, 22, 15, 51, 23],
    [2, 42, 14, 17, 43, 15],
    // 18
    [5, 150, 120, 1, 151, 121],
    [9, 69, 43, 4, 70, 44],
    [17, 50, 22, 1, 51, 23],
    [2, 42, 14, 19, 43, 15],
    // 19
    [3, 141, 113, 4, 142, 114],
    [3, 70, 44, 11, 71, 45],
    [17, 47, 21, 4, 48, 22],
    [9, 39, 13, 16, 40, 14],
    // 20
    [3, 135, 107, 5, 136, 108],
    [3, 67, 41, 13, 68, 42],
    [15, 54, 24, 5, 55, 25],
    [15, 43, 15, 10, 44, 16],
    // 21
    [4, 144, 116, 4, 145, 117],
    [17, 68, 42],
    [17, 50, 22, 6, 51, 23],
    [19, 46, 16, 6, 47, 17],
    // 22
    [2, 139, 111, 7, 140, 112],
    [17, 74, 46],
    [7, 54, 24, 16, 55, 25],
    [34, 37, 13],
    // 23
    [4, 151, 121, 5, 152, 122],
    [4, 75, 47, 14, 76, 48],
    [11, 54, 24, 14, 55, 25],
    [16, 45, 15, 14, 46, 16],
    // 24
    [6, 147, 117, 4, 148, 118],
    [6, 73, 45, 14, 74, 46],
    [11, 54, 24, 16, 55, 25],
    [30, 46, 16, 2, 47, 17],
    // 25
    [8, 132, 106, 4, 133, 107],
    [8, 75, 47, 13, 76, 48],
    [7, 54, 24, 22, 55, 25],
    [22, 45, 15, 13, 46, 16],
    // 26
    [10, 142, 114, 2, 143, 115],
    [19, 74, 46, 4, 75, 47],
    [28, 50, 22, 6, 51, 23],
    [33, 46, 16, 4, 47, 17],
    // 27
    [8, 152, 122, 4, 153, 123],
    [22, 73, 45, 3, 74, 46],
    [8, 53, 23, 26, 54, 24],
    [12, 45, 15, 28, 46, 16],
    // 28
    [3, 147, 117, 10, 148, 118],
    [3, 73, 45, 23, 74, 46],
    [4, 54, 24, 31, 55, 25],
    [11, 45, 15, 31, 46, 16],
    // 29
    [7, 146, 116, 7, 147, 117],
    [21, 73, 45, 7, 74, 46],
    [1, 53, 23, 37, 54, 24],
    [19, 45, 15, 26, 46, 16],
    // 30
    [5, 145, 115, 10, 146, 116],
    [19, 75, 47, 10, 76, 48],
    [15, 54, 24, 25, 55, 25],
    [23, 45, 15, 25, 46, 16],
    // 31
    [13, 145, 115, 3, 146, 116],
    [2, 74, 46, 29, 75, 47],
    [42, 54, 24, 1, 55, 25],
    [23, 45, 15, 28, 46, 16],
    // 32
    [17, 145, 115],
    [10, 74, 46, 23, 75, 47],
    [10, 54, 24, 35, 55, 25],
    [19, 45, 15, 35, 46, 16],
    // 33
    [17, 145, 115, 1, 146, 116],
    [14, 74, 46, 21, 75, 47],
    [29, 54, 24, 19, 55, 25],
    [11, 45, 15, 46, 46, 16],
    // 34
    [13, 145, 115, 6, 146, 116],
    [14, 74, 46, 23, 75, 47],
    [44, 54, 24, 7, 55, 25],
    [59, 46, 16, 1, 47, 17],
    // 35
    [12, 151, 121, 7, 152, 122],
    [12, 75, 47, 26, 76, 48],
    [39, 54, 24, 14, 55, 25],
    [22, 45, 15, 41, 46, 16],
    // 36
    [6, 151, 121, 14, 152, 122],
    [6, 75, 47, 34, 76, 48],
    [46, 54, 24, 10, 55, 25],
    [2, 45, 15, 64, 46, 16],
    // 37
    [17, 152, 122, 4, 153, 123],
    [29, 74, 46, 14, 75, 47],
    [49, 54, 24, 10, 55, 25],
    [24, 45, 15, 46, 46, 16],
    // 38
    [4, 152, 122, 18, 153, 123],
    [13, 74, 46, 32, 75, 47],
    [48, 54, 24, 14, 55, 25],
    [42, 45, 15, 32, 46, 16],
    // 39
    [20, 147, 117, 4, 148, 118],
    [40, 75, 47, 7, 76, 48],
    [43, 54, 24, 22, 55, 25],
    [10, 45, 15, 67, 46, 16],
    // 40
    [19, 148, 118, 6, 149, 119],
    [18, 75, 47, 31, 76, 48],
    [34, 54, 24, 34, 55, 25],
    [20, 45, 15, 61, 46, 16]
  ];
  const qrRSBlock = function(totalCount, dataCount) {
    const _this2 = {};
    _this2.totalCount = totalCount;
    _this2.dataCount = dataCount;
    return _this2;
  };
  const _this = {};
  const getRsBlockTable = function(typeNumber, errorCorrectionLevel) {
    switch (errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L:
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M:
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q:
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H:
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default:
        return void 0;
    }
  };
  _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {
    const rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);
    if (typeof rsBlock == "undefined") {
      throw "bad rs block @ typeNumber:" + typeNumber + "/errorCorrectionLevel:" + errorCorrectionLevel;
    }
    const length = rsBlock.length / 3;
    const list = [];
    for (let i = 0; i < length; i += 1) {
      const count = rsBlock[i * 3 + 0];
      const totalCount = rsBlock[i * 3 + 1];
      const dataCount = rsBlock[i * 3 + 2];
      for (let j = 0; j < count; j += 1) {
        list.push(qrRSBlock(totalCount, dataCount));
      }
    }
    return list;
  };
  return _this;
}();
var qrBitBuffer = function() {
  const _buffer = [];
  let _length = 0;
  const _this = {};
  _this.getBuffer = function() {
    return _buffer;
  };
  _this.getAt = function(index) {
    const bufIndex = Math.floor(index / 8);
    return (_buffer[bufIndex] >>> 7 - index % 8 & 1) == 1;
  };
  _this.put = function(num, length) {
    for (let i = 0; i < length; i += 1) {
      _this.putBit((num >>> length - i - 1 & 1) == 1);
    }
  };
  _this.getLengthInBits = function() {
    return _length;
  };
  _this.putBit = function(bit) {
    const bufIndex = Math.floor(_length / 8);
    if (_buffer.length <= bufIndex) {
      _buffer.push(0);
    }
    if (bit) {
      _buffer[bufIndex] |= 128 >>> _length % 8;
    }
    _length += 1;
  };
  return _this;
};
var qrNumber = function(data) {
  const _mode = QRMode.MODE_NUMBER;
  const _data = data;
  const _this = {};
  _this.getMode = function() {
    return _mode;
  };
  _this.getLength = function(buffer) {
    return _data.length;
  };
  _this.write = function(buffer) {
    const data2 = _data;
    let i = 0;
    while (i + 2 < data2.length) {
      buffer.put(strToNum(data2.substring(i, i + 3)), 10);
      i += 3;
    }
    if (i < data2.length) {
      if (data2.length - i == 1) {
        buffer.put(strToNum(data2.substring(i, i + 1)), 4);
      } else if (data2.length - i == 2) {
        buffer.put(strToNum(data2.substring(i, i + 2)), 7);
      }
    }
  };
  const strToNum = function(s) {
    let num = 0;
    for (let i = 0; i < s.length; i += 1) {
      num = num * 10 + chatToNum(s.charAt(i));
    }
    return num;
  };
  const chatToNum = function(c) {
    if ("0" <= c && c <= "9") {
      return c.charCodeAt(0) - "0".charCodeAt(0);
    }
    throw "illegal char :" + c;
  };
  return _this;
};
var qrAlphaNum = function(data) {
  const _mode = QRMode.MODE_ALPHA_NUM;
  const _data = data;
  const _this = {};
  _this.getMode = function() {
    return _mode;
  };
  _this.getLength = function(buffer) {
    return _data.length;
  };
  _this.write = function(buffer) {
    const s = _data;
    let i = 0;
    while (i + 1 < s.length) {
      buffer.put(
        getCode(s.charAt(i)) * 45 + getCode(s.charAt(i + 1)),
        11
      );
      i += 2;
    }
    if (i < s.length) {
      buffer.put(getCode(s.charAt(i)), 6);
    }
  };
  const getCode = function(c) {
    if ("0" <= c && c <= "9") {
      return c.charCodeAt(0) - "0".charCodeAt(0);
    } else if ("A" <= c && c <= "Z") {
      return c.charCodeAt(0) - "A".charCodeAt(0) + 10;
    } else {
      switch (c) {
        case " ":
          return 36;
        case "$":
          return 37;
        case "%":
          return 38;
        case "*":
          return 39;
        case "+":
          return 40;
        case "-":
          return 41;
        case ".":
          return 42;
        case "/":
          return 43;
        case ":":
          return 44;
        default:
          throw "illegal char :" + c;
      }
    }
  };
  return _this;
};
var qr8BitByte = function(data) {
  const _mode = QRMode.MODE_8BIT_BYTE;
  const _data = data;
  const _bytes = qrcode.stringToBytes(data);
  const _this = {};
  _this.getMode = function() {
    return _mode;
  };
  _this.getLength = function(buffer) {
    return _bytes.length;
  };
  _this.write = function(buffer) {
    for (let i = 0; i < _bytes.length; i += 1) {
      buffer.put(_bytes[i], 8);
    }
  };
  return _this;
};
var qrKanji = function(data) {
  const _mode = QRMode.MODE_KANJI;
  const _data = data;
  const stringToBytes2 = qrcode.stringToBytes;
  !function(c, code) {
    const test = stringToBytes2(c);
    if (test.length != 2 || (test[0] << 8 | test[1]) != code) {
      throw "sjis not supported.";
    }
  }("\u53CB", 38726);
  const _bytes = stringToBytes2(data);
  const _this = {};
  _this.getMode = function() {
    return _mode;
  };
  _this.getLength = function(buffer) {
    return ~~(_bytes.length / 2);
  };
  _this.write = function(buffer) {
    const data2 = _bytes;
    let i = 0;
    while (i + 1 < data2.length) {
      let c = (255 & data2[i]) << 8 | 255 & data2[i + 1];
      if (33088 <= c && c <= 40956) {
        c -= 33088;
      } else if (57408 <= c && c <= 60351) {
        c -= 49472;
      } else {
        throw "illegal char at " + (i + 1) + "/" + c;
      }
      c = (c >>> 8 & 255) * 192 + (c & 255);
      buffer.put(c, 13);
      i += 2;
    }
    if (i < data2.length) {
      throw "illegal char at " + (i + 1);
    }
  };
  return _this;
};
var byteArrayOutputStream = function() {
  const _bytes = [];
  const _this = {};
  _this.writeByte = function(b) {
    _bytes.push(b & 255);
  };
  _this.writeShort = function(i) {
    _this.writeByte(i);
    _this.writeByte(i >>> 8);
  };
  _this.writeBytes = function(b, off, len) {
    off = off || 0;
    len = len || b.length;
    for (let i = 0; i < len; i += 1) {
      _this.writeByte(b[i + off]);
    }
  };
  _this.writeString = function(s) {
    for (let i = 0; i < s.length; i += 1) {
      _this.writeByte(s.charCodeAt(i));
    }
  };
  _this.toByteArray = function() {
    return _bytes;
  };
  _this.toString = function() {
    let s = "";
    s += "[";
    for (let i = 0; i < _bytes.length; i += 1) {
      if (i > 0) {
        s += ",";
      }
      s += _bytes[i];
    }
    s += "]";
    return s;
  };
  return _this;
};
var base64EncodeOutputStream = function() {
  let _buffer = 0;
  let _buflen = 0;
  let _length = 0;
  let _base64 = "";
  const _this = {};
  const writeEncoded = function(b) {
    _base64 += String.fromCharCode(encode(b & 63));
  };
  const encode = function(n) {
    if (n < 0) {
      throw "n:" + n;
    } else if (n < 26) {
      return 65 + n;
    } else if (n < 52) {
      return 97 + (n - 26);
    } else if (n < 62) {
      return 48 + (n - 52);
    } else if (n == 62) {
      return 43;
    } else if (n == 63) {
      return 47;
    } else {
      throw "n:" + n;
    }
  };
  _this.writeByte = function(n) {
    _buffer = _buffer << 8 | n & 255;
    _buflen += 8;
    _length += 1;
    while (_buflen >= 6) {
      writeEncoded(_buffer >>> _buflen - 6);
      _buflen -= 6;
    }
  };
  _this.flush = function() {
    if (_buflen > 0) {
      writeEncoded(_buffer << 6 - _buflen);
      _buffer = 0;
      _buflen = 0;
    }
    if (_length % 3 != 0) {
      const padlen = 3 - _length % 3;
      for (let i = 0; i < padlen; i += 1) {
        _base64 += "=";
      }
    }
  };
  _this.toString = function() {
    return _base64;
  };
  return _this;
};
var base64DecodeInputStream = function(str) {
  const _str = str;
  let _pos = 0;
  let _buffer = 0;
  let _buflen = 0;
  const _this = {};
  _this.read = function() {
    while (_buflen < 8) {
      if (_pos >= _str.length) {
        if (_buflen == 0) {
          return -1;
        }
        throw "unexpected end of file./" + _buflen;
      }
      const c = _str.charAt(_pos);
      _pos += 1;
      if (c == "=") {
        _buflen = 0;
        return -1;
      } else if (c.match(/^\s$/)) {
        continue;
      }
      _buffer = _buffer << 6 | decode(c.charCodeAt(0));
      _buflen += 6;
    }
    const n = _buffer >>> _buflen - 8 & 255;
    _buflen -= 8;
    return n;
  };
  const decode = function(c) {
    if (65 <= c && c <= 90) {
      return c - 65;
    } else if (97 <= c && c <= 122) {
      return c - 97 + 26;
    } else if (48 <= c && c <= 57) {
      return c - 48 + 52;
    } else if (c == 43) {
      return 62;
    } else if (c == 47) {
      return 63;
    } else {
      throw "c:" + c;
    }
  };
  return _this;
};
var gifImage = function(width, height) {
  const _width = width;
  const _height = height;
  const _data = new Array(width * height);
  const _this = {};
  _this.setPixel = function(x, y, pixel) {
    _data[y * _width + x] = pixel;
  };
  _this.write = function(out) {
    out.writeString("GIF87a");
    out.writeShort(_width);
    out.writeShort(_height);
    out.writeByte(128);
    out.writeByte(0);
    out.writeByte(0);
    out.writeByte(0);
    out.writeByte(0);
    out.writeByte(0);
    out.writeByte(255);
    out.writeByte(255);
    out.writeByte(255);
    out.writeString(",");
    out.writeShort(0);
    out.writeShort(0);
    out.writeShort(_width);
    out.writeShort(_height);
    out.writeByte(0);
    const lzwMinCodeSize = 2;
    const raster = getLZWRaster(lzwMinCodeSize);
    out.writeByte(lzwMinCodeSize);
    let offset = 0;
    while (raster.length - offset > 255) {
      out.writeByte(255);
      out.writeBytes(raster, offset, 255);
      offset += 255;
    }
    out.writeByte(raster.length - offset);
    out.writeBytes(raster, offset, raster.length - offset);
    out.writeByte(0);
    out.writeString(";");
  };
  const bitOutputStream = function(out) {
    const _out = out;
    let _bitLength = 0;
    let _bitBuffer = 0;
    const _this2 = {};
    _this2.write = function(data, length) {
      if (data >>> length != 0) {
        throw "length over";
      }
      while (_bitLength + length >= 8) {
        _out.writeByte(255 & (data << _bitLength | _bitBuffer));
        length -= 8 - _bitLength;
        data >>>= 8 - _bitLength;
        _bitBuffer = 0;
        _bitLength = 0;
      }
      _bitBuffer = data << _bitLength | _bitBuffer;
      _bitLength = _bitLength + length;
    };
    _this2.flush = function() {
      if (_bitLength > 0) {
        _out.writeByte(_bitBuffer);
      }
    };
    return _this2;
  };
  const getLZWRaster = function(lzwMinCodeSize) {
    const clearCode = 1 << lzwMinCodeSize;
    const endCode = (1 << lzwMinCodeSize) + 1;
    let bitLength = lzwMinCodeSize + 1;
    const table = lzwTable();
    for (let i = 0; i < clearCode; i += 1) {
      table.add(String.fromCharCode(i));
    }
    table.add(String.fromCharCode(clearCode));
    table.add(String.fromCharCode(endCode));
    const byteOut = byteArrayOutputStream();
    const bitOut = bitOutputStream(byteOut);
    bitOut.write(clearCode, bitLength);
    let dataIndex = 0;
    let s = String.fromCharCode(_data[dataIndex]);
    dataIndex += 1;
    while (dataIndex < _data.length) {
      const c = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;
      if (table.contains(s + c)) {
        s = s + c;
      } else {
        bitOut.write(table.indexOf(s), bitLength);
        if (table.size() < 4095) {
          if (table.size() == 1 << bitLength) {
            bitLength += 1;
          }
          table.add(s + c);
        }
        s = c;
      }
    }
    bitOut.write(table.indexOf(s), bitLength);
    bitOut.write(endCode, bitLength);
    bitOut.flush();
    return byteOut.toByteArray();
  };
  const lzwTable = function() {
    const _map = {};
    let _size = 0;
    const _this2 = {};
    _this2.add = function(key) {
      if (_this2.contains(key)) {
        throw "dup key:" + key;
      }
      _map[key] = _size;
      _size += 1;
    };
    _this2.size = function() {
      return _size;
    };
    _this2.indexOf = function(key) {
      return _map[key];
    };
    _this2.contains = function(key) {
      return typeof _map[key] != "undefined";
    };
    return _this2;
  };
  return _this;
};
var createDataURL = function(width, height, getPixel) {
  const gif = gifImage(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      gif.setPixel(x, y, getPixel(x, y));
    }
  }
  const b = byteArrayOutputStream();
  gif.write(b);
  const base64 = base64EncodeOutputStream();
  const bytes = b.toByteArray();
  for (let i = 0; i < bytes.length; i += 1) {
    base64.writeByte(bytes[i]);
  }
  base64.flush();
  return "data:image/gif;base64," + base64;
};
var qrcode_default = qrcode;
var stringToBytes = qrcode.stringToBytes;

// node_modules/react-qr-code/lib/index.mjs
import React3, { forwardRef as forwardRef3 } from "react";
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function(n) {
    for (var e = 1; e < arguments.length; e++) {
      var t2 = arguments[e];
      for (var r in t2) ({}).hasOwnProperty.call(t2, r) && (n[r] = t2[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
function _objectWithoutProperties(e, t2) {
  if (null == e) return {};
  var o, r, i = _objectWithoutPropertiesLoose(e, t2);
  if (Object.getOwnPropertySymbols) {
    var n = Object.getOwnPropertySymbols(e);
    for (r = 0; r < n.length; r++) o = n[r], -1 === t2.indexOf(o) && {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]);
  }
  return i;
}
function _objectWithoutPropertiesLoose(r, e) {
  if (null == r) return {};
  var t2 = {};
  for (var n in r) if ({}.hasOwnProperty.call(r, n)) {
    if (-1 !== e.indexOf(n)) continue;
    t2[n] = r[n];
  }
  return t2;
}
var _excluded$1 = ["bgColor", "bgD", "fgD", "fgColor", "size", "title", "viewBoxSize", "xmlns"];
var propTypes$1 = {
  bgColor: import_prop_types.default.oneOfType([import_prop_types.default.object, import_prop_types.default.string]).isRequired,
  bgD: import_prop_types.default.string.isRequired,
  fgColor: import_prop_types.default.oneOfType([import_prop_types.default.object, import_prop_types.default.string]).isRequired,
  fgD: import_prop_types.default.string.isRequired,
  size: import_prop_types.default.number.isRequired,
  title: import_prop_types.default.string,
  viewBoxSize: import_prop_types.default.number.isRequired,
  xmlns: import_prop_types.default.string
};
var QRCodeSvg = /* @__PURE__ */ forwardRef3(function(_ref, ref) {
  var bgColor = _ref.bgColor, bgD = _ref.bgD, fgD = _ref.fgD, fgColor = _ref.fgColor, size = _ref.size, title = _ref.title, viewBoxSize = _ref.viewBoxSize, _ref$xmlns = _ref.xmlns, xmlns = _ref$xmlns === void 0 ? "http://www.w3.org/2000/svg" : _ref$xmlns, props = _objectWithoutProperties(_ref, _excluded$1);
  return /* @__PURE__ */ React3.createElement("svg", _extends({}, props, {
    height: size,
    ref,
    viewBox: "0 0 ".concat(viewBoxSize, " ").concat(viewBoxSize),
    width: size,
    xmlns
  }), title ? /* @__PURE__ */ React3.createElement("title", null, title) : null, /* @__PURE__ */ React3.createElement("path", {
    d: bgD,
    fill: bgColor
  }), /* @__PURE__ */ React3.createElement("path", {
    d: fgD,
    fill: fgColor
  }));
});
QRCodeSvg.displayName = "QRCodeSvg";
QRCodeSvg.propTypes = propTypes$1;
var _excluded = ["bgColor", "fgColor", "level", "size", "value"];
qrcode_default.stringToBytes = function(s) {
  return Array.from(new TextEncoder().encode(s));
};
var propTypes = {
  bgColor: import_prop_types.default.oneOfType([import_prop_types.default.object, import_prop_types.default.string]),
  fgColor: import_prop_types.default.oneOfType([import_prop_types.default.object, import_prop_types.default.string]),
  level: import_prop_types.default.string,
  size: import_prop_types.default.number,
  value: import_prop_types.default.string.isRequired
};
var QRCode = /* @__PURE__ */ forwardRef3(function(_ref, ref) {
  var _ref$bgColor = _ref.bgColor, bgColor = _ref$bgColor === void 0 ? "#FFFFFF" : _ref$bgColor, _ref$fgColor = _ref.fgColor, fgColor = _ref$fgColor === void 0 ? "#000000" : _ref$fgColor, _ref$level = _ref.level, level = _ref$level === void 0 ? "L" : _ref$level, _ref$size = _ref.size, size = _ref$size === void 0 ? 256 : _ref$size, value = _ref.value, props = _objectWithoutProperties(_ref, _excluded);
  var qr = qrcode_default(0, level);
  qr.addData(value);
  qr.make();
  var moduleCount = qr.getModuleCount();
  var cells = Array.from({
    length: moduleCount
  }, function(_, rowIndex) {
    return Array.from({
      length: moduleCount
    }, function(_2, colIndex) {
      return qr.isDark(rowIndex, colIndex);
    });
  });
  return /* @__PURE__ */ React3.createElement(QRCodeSvg, _extends({}, props, {
    bgColor,
    bgD: cells.map(function(row, rowIndex) {
      return row.map(function(cell, cellIndex) {
        return !cell ? "M ".concat(cellIndex, " ").concat(rowIndex, " l 1 0 0 1 -1 0 Z") : "";
      }).join(" ");
    }).join(" "),
    fgColor,
    fgD: cells.map(function(row, rowIndex) {
      return row.map(function(cell, cellIndex) {
        return cell ? "M ".concat(cellIndex, " ").concat(rowIndex, " l 1 0 0 1 -1 0 Z") : "";
      }).join(" ");
    }).join(" "),
    ref,
    size,
    viewBoxSize: moduleCount
  }));
});
QRCode.displayName = "QRCode";
QRCode.propTypes = propTypes;

// src/tabs/WebTab.tsx
import { jsx as jsx13, jsxs as jsxs13 } from "react/jsx-runtime";
var log2 = createLogger("WebTab");
var DEFAULT_WEB_CONFIG = { enabled: true, host: "0.0.0.0", port: 9830 };
function WebTab({ config, onConfigChange, loading, statusRefreshKey = 0 }) {
  const { t: t2 } = useTranslation(["settings", "common"]);
  const web = config.web ?? DEFAULT_WEB_CONFIG;
  const [localIps, setLocalIps] = useState8([]);
  const [webServerStatus, setWebServerStatus] = useState8(null);
  const [openingBrowser, setOpeningBrowser] = useState8(false);
  const [selectedAddress, setSelectedAddress] = useState8("");
  useEffect7(() => {
    if (!web.enabled) return;
    invoke("get_local_ips").then(setLocalIps).catch(() => setLocalIps([]));
  }, [web.enabled]);
  useEffect7(() => {
    let cancelled = false;
    getWebServerStatus().then((status) => {
      if (!cancelled) setWebServerStatus(status);
    }).catch(() => {
      if (!cancelled) setWebServerStatus(null);
    });
    return () => {
      cancelled = true;
    };
  }, [statusRefreshKey]);
  const updateWeb = (patch) => {
    onConfigChange({ ...config, web: { ...web, ...patch } });
  };
  const effectivePort = webServerStatus?.running && webServerStatus.port ? webServerStatus.port : web.port;
  const addressList = useMemo4(() => {
    const set = /* @__PURE__ */ new Set();
    const list = [];
    const add = (label, url) => {
      if (set.has(url)) return;
      set.add(url);
      list.push({ label, url });
    };
    if (web.host && web.host !== "0.0.0.0" && web.host !== "::" && web.host !== "localhost" && web.host !== "127.0.0.1") {
      add(t2("web.host"), `http://${web.host}:${effectivePort}`);
    }
    for (const ip of localIps) {
      add(ip, `http://${ip}:${effectivePort}`);
    }
    add("localhost", `http://localhost:${effectivePort}`);
    return list;
  }, [effectivePort, web.host, localIps, t2]);
  useEffect7(() => {
    if (addressList.length > 0 && !addressList.some((a) => a.url === selectedAddress)) {
      setSelectedAddress(addressList[0].url);
    }
  }, [addressList, selectedAddress]);
  const qrValue = useMemo4(() => {
    const base = selectedAddress;
    if (web.token) {
      const sep = base.includes("?") ? "&" : "?";
      return `${base}${sep}token=${encodeURIComponent(web.token)}`;
    }
    return base;
  }, [selectedAddress, web.token]);
  const handleOpenInBrowser = async () => {
    setOpeningBrowser(true);
    try {
      await openInBrowser(selectedAddress);
    } catch (e) {
      log2.warn("Open web URL failed", { error: String(e), url: selectedAddress });
    } finally {
      setOpeningBrowser(false);
    }
  };
  return /* @__PURE__ */ jsxs13("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsx13("div", { className: "p-4 bg-surface rounded-lg border border-border", children: /* @__PURE__ */ jsxs13("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs13("div", { children: [
        /* @__PURE__ */ jsx13("h3", { className: "text-sm font-medium text-text-primary", children: t2("web.enableTitle") }),
        /* @__PURE__ */ jsx13("p", { className: "mt-1 text-xs text-text-tertiary", children: t2("web.enableDesc") })
      ] }),
      /* @__PURE__ */ jsx13(
        "button",
        {
          type: "button",
          role: "switch",
          "aria-checked": web.enabled,
          onClick: () => updateWeb({ enabled: !web.enabled }),
          disabled: loading,
          className: `relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${web.enabled ? "bg-primary" : "bg-border"} ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`,
          children: /* @__PURE__ */ jsx13(
            "span",
            {
              className: `inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${web.enabled ? "translate-x-6" : "translate-x-1"}`
            }
          )
        }
      )
    ] }) }),
    /* @__PURE__ */ jsxs13("div", { className: "p-4 bg-surface rounded-lg border border-border", children: [
      /* @__PURE__ */ jsx13("h3", { className: "text-sm font-medium text-text-primary mb-3", children: t2("web.qrTitle") }),
      !web.enabled ? /* @__PURE__ */ jsx13("p", { className: "text-xs text-text-tertiary", children: t2("web.qrDisabled") }) : addressList.length === 0 ? /* @__PURE__ */ jsx13("p", { className: "text-xs text-text-tertiary", children: t2("web.qrNoIp") }) : /* @__PURE__ */ jsxs13("div", { className: "flex flex-col items-center gap-4", children: [
        /* @__PURE__ */ jsxs13("div", { className: "w-full", children: [
          /* @__PURE__ */ jsxs13("p", { className: "text-xs text-text-secondary mb-2", children: [
            t2("web.selectAddress"),
            "\uFF1A"
          ] }),
          /* @__PURE__ */ jsx13("div", { className: "space-y-1.5", children: addressList.map(({ label, url }) => /* @__PURE__ */ jsxs13(
            "label",
            {
              className: `flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors ${selectedAddress === url ? "bg-primary/10 border border-primary/30" : "hover:bg-background-surface border border-transparent"}`,
              children: [
                /* @__PURE__ */ jsx13(
                  "input",
                  {
                    type: "radio",
                    name: "qr-address",
                    value: url,
                    checked: selectedAddress === url,
                    onChange: () => setSelectedAddress(url),
                    className: "accent-primary"
                  }
                ),
                /* @__PURE__ */ jsx13("span", { className: "text-xs text-text-secondary", children: label }),
                /* @__PURE__ */ jsx13("code", { className: "text-xs text-text-primary ml-auto", children: url })
              ]
            },
            url
          )) })
        ] }),
        /* @__PURE__ */ jsx13("div", { className: "p-3 bg-white rounded-lg", children: /* @__PURE__ */ jsx13(QRCode, { value: qrValue, size: 160 }) }),
        web.token ? /* @__PURE__ */ jsx13("div", { className: "w-full px-3 py-2 rounded-lg bg-green/5 border border-green/20 text-xs text-green text-center", children: "\u2705 \u4E8C\u7EF4\u7801\u5DF2\u5305\u542B Token \u4FE1\u606F\uFF0C\u624B\u673A\u626B\u7801\u5373\u53EF\u81EA\u52A8\u5B8C\u6210\u9274\u6743" }) : /* @__PURE__ */ jsx13("div", { className: "w-full px-3 py-2 rounded-lg bg-warning/5 border border-warning/20 text-xs text-warning text-center", children: "\u26A0\uFE0F \u672A\u8BBE\u7F6E Token\uFF0C\u4E8C\u7EF4\u7801\u4EC5\u5305\u542B URL\uFF0C\u626B\u7801\u540E\u9700\u624B\u52A8\u8F93\u5165 Token" }),
        /* @__PURE__ */ jsx13("div", { className: "flex items-center justify-between gap-3", children: /* @__PURE__ */ jsx13(
          "button",
          {
            type: "button",
            onClick: handleOpenInBrowser,
            disabled: !web.enabled || openingBrowser || loading,
            className: "px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed",
            children: openingBrowser ? "..." : t2("web.openInBrowser")
          }
        ) }),
        /* @__PURE__ */ jsx13("p", { className: "text-xs text-text-tertiary text-center", children: t2("web.qrHint") })
      ] })
    ] }),
    /* @__PURE__ */ jsxs13("div", { className: "p-4 bg-surface rounded-lg border border-border", children: [
      /* @__PURE__ */ jsx13("h3", { className: "text-sm font-medium text-text-primary mb-3", children: t2("web.portConfig") }),
      /* @__PURE__ */ jsxs13("div", { className: "mb-4", children: [
        /* @__PURE__ */ jsx13("label", { className: "block text-xs text-text-secondary mb-2", children: t2("web.host") }),
        /* @__PURE__ */ jsx13(
          "input",
          {
            type: "text",
            value: web.host,
            onChange: (e) => updateWeb({ host: e.target.value }),
            placeholder: "0.0.0.0",
            className: "w-full px-3 py-2 bg-background-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
            disabled: loading || !web.enabled
          }
        ),
        /* @__PURE__ */ jsx13("p", { className: "mt-1 text-xs text-text-tertiary", children: t2("web.hostHint") })
      ] }),
      /* @__PURE__ */ jsxs13("div", { children: [
        /* @__PURE__ */ jsx13("label", { className: "block text-xs text-text-secondary mb-2", children: t2("web.port") }),
        /* @__PURE__ */ jsx13(
          "input",
          {
            type: "number",
            min: 1024,
            max: 65535,
            value: web.port,
            onChange: (e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && val <= 65535) {
                updateWeb({ port: val });
              }
            },
            placeholder: "9830",
            className: "w-full px-3 py-2 bg-background-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
            disabled: loading || !web.enabled
          }
        ),
        /* @__PURE__ */ jsx13("p", { className: "mt-1 text-xs text-text-tertiary", children: t2("web.portHint") })
      ] }),
      /* @__PURE__ */ jsxs13("div", { className: "mt-4", children: [
        /* @__PURE__ */ jsx13("label", { className: "block text-xs text-text-secondary mb-2", children: t2("web.token") }),
        /* @__PURE__ */ jsx13(
          "input",
          {
            type: "password",
            value: web.token ?? "",
            onChange: (e) => updateWeb({ token: e.target.value }),
            placeholder: t2("web.tokenPlaceholder"),
            className: "w-full px-3 py-2 bg-background-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
            disabled: loading || !web.enabled
          }
        ),
        /* @__PURE__ */ jsx13("p", { className: "mt-1 text-xs text-text-tertiary", children: t2("web.tokenHint") })
      ] })
    ] })
  ] });
}

// src/tabs/PluginTab.tsx
import { useCallback as useCallback4, useEffect as useEffect9, useMemo as useMemo5, useState as useState10 } from "react";

// src/tabs/PluginConfigForm.tsx
import { useState as useState9, useEffect as useEffect8, useCallback as useCallback3 } from "react";
import { jsx as jsx14, jsxs as jsxs14 } from "react/jsx-runtime";
var log3 = createLogger("PluginConfigForm");
function PluginConfigForm({ manifest, onSaved }) {
  const { t: t2 } = useTranslation("settings");
  const schema = manifest.contributes.configSchema;
  const [values, setValues] = useState9({});
  const [loading, setLoading] = useState9(true);
  const [saving, setSaving] = useState9(false);
  const [error, setError] = useState9(null);
  const [dirty, setDirty] = useState9(false);
  const pluginId = manifest.id;
  const loadConfig = useCallback3(async () => {
    setLoading(true);
    setError(null);
    try {
      const config = await getPluginConfig(pluginId);
      const merged2 = {};
      for (const field of schema ?? []) {
        merged2[field.key] = config[field.key] ?? field.default;
      }
      setValues(merged2);
      setDirty(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      log3.error("\u52A0\u8F7D\u63D2\u4EF6\u914D\u7F6E\u5931\u8D25", e instanceof Error ? e : new Error(msg), { pluginId });
    } finally {
      setLoading(false);
    }
  }, [pluginId, schema]);
  useEffect8(() => {
    if (schema?.length) {
      void loadConfig();
    } else {
      setLoading(false);
    }
  }, [schema, loadConfig]);
  const handleChange = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await setPluginConfig(pluginId, values);
      setDirty(false);
      onSaved?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      log3.error("\u4FDD\u5B58\u63D2\u4EF6\u914D\u7F6E\u5931\u8D25", e instanceof Error ? e : new Error(msg), { pluginId });
    } finally {
      setSaving(false);
    }
  };
  if (!schema?.length) {
    return null;
  }
  if (loading) {
    return /* @__PURE__ */ jsx14("div", { className: "p-3 text-xs text-text-tertiary", children: t2("common.loading") });
  }
  return /* @__PURE__ */ jsxs14("div", { className: "space-y-2.5 px-2.5 pt-2 border-t border-border mt-2", children: [
    /* @__PURE__ */ jsx14("div", { className: "text-[10px] font-medium text-text-secondary", children: t2("settings:plugin.configTitle", { name: manifest.name }) }),
    error && /* @__PURE__ */ jsx14("div", { className: "text-[10px] text-error bg-error/10 px-2 py-1 rounded", children: error }),
    schema.map((field) => /* @__PURE__ */ jsx14(
      ConfigField,
      {
        field,
        value: values[field.key],
        onChange: (v) => handleChange(field.key, v),
        disabled: saving
      },
      field.key
    )),
    /* @__PURE__ */ jsxs14("div", { className: "flex items-center gap-2 pt-1", children: [
      /* @__PURE__ */ jsx14(
        "button",
        {
          onClick: handleSave,
          disabled: !dirty || saving,
          className: "px-2.5 py-1 text-[11px] bg-primary text-primary-content rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity",
          children: saving ? t2("common.saving") : t2("common.save")
        }
      ),
      dirty && /* @__PURE__ */ jsx14("span", { className: "text-[9px] text-warning bg-warning/10 px-1.5 py-0.5 rounded", children: t2("settings:plugin.unsavedChanges") })
    ] })
  ] });
}
function ConfigField({
  field,
  value,
  onChange,
  disabled
}) {
  const label = field.label;
  const help = field.help;
  const inputClass = "w-full px-2 py-1.5 bg-background-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-primary transition-colors disabled:opacity-50";
  const labelEl = /* @__PURE__ */ jsx14("label", { className: "block text-[10px] text-text-tertiary mb-1", children: label });
  const helpEl = help ? /* @__PURE__ */ jsx14("p", { className: "mt-0.5 text-[9px] text-text-tertiary", children: help }) : null;
  switch (field.type) {
    case "boolean":
      return /* @__PURE__ */ jsxs14("div", { children: [
        /* @__PURE__ */ jsxs14("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx14(
            "input",
            {
              type: "checkbox",
              checked: Boolean(value),
              onChange: (e) => onChange(e.target.checked),
              disabled,
              className: "w-3.5 h-3.5"
            }
          ),
          /* @__PURE__ */ jsx14("span", { className: "text-[11px] text-text-primary", children: label })
        ] }),
        helpEl
      ] });
    case "select":
      return /* @__PURE__ */ jsxs14("div", { children: [
        labelEl,
        /* @__PURE__ */ jsx14(
          "select",
          {
            value: String(value ?? ""),
            onChange: (e) => onChange(e.target.value),
            disabled,
            className: inputClass,
            children: field.options?.map((opt) => /* @__PURE__ */ jsx14("option", { value: String(opt.value), children: opt.label }, String(opt.value)))
          }
        ),
        helpEl
      ] });
    case "number":
      return /* @__PURE__ */ jsxs14("div", { children: [
        labelEl,
        /* @__PURE__ */ jsx14(
          "input",
          {
            type: "number",
            value: Number(value ?? 0),
            onChange: (e) => onChange(Number(e.target.value)),
            disabled,
            placeholder: field.placeholder,
            className: inputClass
          }
        ),
        helpEl
      ] });
    case "secret":
      return /* @__PURE__ */ jsxs14("div", { children: [
        labelEl,
        /* @__PURE__ */ jsx14(
          "input",
          {
            type: "password",
            value: String(value ?? ""),
            onChange: (e) => onChange(e.target.value),
            disabled,
            placeholder: field.placeholder ?? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
            className: inputClass
          }
        ),
        helpEl
      ] });
    case "path":
      return /* @__PURE__ */ jsxs14("div", { children: [
        labelEl,
        /* @__PURE__ */ jsx14(
          "input",
          {
            type: "text",
            value: String(value ?? ""),
            onChange: (e) => onChange(e.target.value),
            disabled,
            placeholder: field.placeholder ?? "C:\\path\\to\\...",
            className: `${inputClass} font-mono`
          }
        ),
        helpEl
      ] });
    case "string":
    default:
      if (field.multiline) {
        return /* @__PURE__ */ jsxs14("div", { children: [
          labelEl,
          /* @__PURE__ */ jsx14(
            "textarea",
            {
              value: String(value ?? ""),
              onChange: (e) => onChange(e.target.value),
              disabled,
              placeholder: field.placeholder,
              rows: 3,
              className: `${inputClass} resize-y`
            }
          ),
          helpEl
        ] });
      }
      return /* @__PURE__ */ jsxs14("div", { children: [
        labelEl,
        /* @__PURE__ */ jsx14(
          "input",
          {
            type: "text",
            value: String(value ?? ""),
            onChange: (e) => onChange(e.target.value),
            disabled,
            placeholder: field.placeholder,
            className: inputClass
          }
        ),
        helpEl
      ] });
  }
}

// src/tabs/PluginTab.tsx
import { Fragment as Fragment2, jsx as jsx15, jsxs as jsxs15 } from "react/jsx-runtime";
var MARKETPLACE_PLUGIN_ID = "polaris.marketplace";
var MARKETPLACE_DOWNLOAD_URL = "https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@main/plugins/marketplace/marketplace.zip";
function formatPermissionLabel(key, t2) {
  return t2(`plugins.permissions.${key}`, { defaultValue: key });
}
function PluginGuide() {
  const [copied, setCopied] = useState10(false);
  const guideContent = `# Polaris \u63D2\u4EF6\u5F00\u53D1\u6307\u5357

## \u5FEB\u901F\u5F00\u59CB \u2014 \u6700\u7B80 MCP \u63D2\u4EF6

### \u76EE\u5F55\u7ED3\u6784

my-plugin/
\u251C\u2500\u2500 plugin.json
\u2514\u2500\u2500 mcp/
    \u2514\u2500\u2500 server.js

### plugin.json

{
  "id": "my-tool",
  "name": "\u6211\u7684\u5DE5\u5177",
  "version": "1.0.0",
  "enabledByDefault": true,
  "contributes": {
    "mcpServers": [{
      "id": "my-server",
      "transport": "stdio",
      "command": "node",
      "argsTemplate": ["{{pluginDir}}/mcp/server.js"]
    }]
  },
  "permissions": { "aiToolAccess": true }
}

### mcp/server.js

#!/usr/bin/env node
function send(m) { process.stdout.write(JSON.stringify(m) + '\\n') }

const tools = [{
  name: 'my_tool',
  description: '\u5DE5\u5177\u63CF\u8FF0',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string', description: '\u8F93\u5165\u6587\u672C' } },
    required: ['text']
  }
}]

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', c => {
  buf += c
  while (true) {
    const i = buf.indexOf('\\n')
    if (i === -1) break
    const msg = JSON.parse(buf.slice(0, i).trim())
    buf = buf.slice(i + 1)
    if (!msg) continue

    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'my-tool', version: '1.0.0' }
      }})
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools } })
    } else if (msg.method === 'tools/call') {
      const args = msg.params?.arguments || {}
      send({ jsonrpc: '2.0', id: msg.id, result: {
        content: [{ type: 'text', text: '\u7ED3\u679C: ' + args.text }]
      }})
    }
  }
})

\u5B89\u88C5\u65B9\u5F0F\uFF1A\u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Install from directory \u2192 \u9009\u62E9\u6B64\u76EE\u5F55\u3002

---

## Manifest \u89C4\u8303

### \u5B8C\u6574 plugin.json

{
  "id": "my-plugin",              // \u5FC5\u586B\uFF0C\u5168\u5C40\u552F\u4E00
  "name": "\u6211\u7684\u63D2\u4EF6",              // \u5FC5\u586B\uFF0C\u663E\u793A\u540D\u79F0
  "version": "1.0.0",             // \u5FC5\u586B\uFF0C\u8BED\u4E49\u5316\u7248\u672C
  "description": "\u63D2\u4EF6\u63CF\u8FF0",       // \u53EF\u9009
  "enabledByDefault": true,       // \u53EF\u9009\uFF0C\u9ED8\u8BA4 true

  "contributes": {
    "views": [{                   // ActivityBar \u5165\u53E3
      "id": "my-plugin.panel",
      "area": "activityBar",      // \u56FA\u5B9A\u503C
      "panelType": "myPanel",     // \u5168\u5C40\u552F\u4E00\uFF0C\u6620\u5C04 LeftPanelType
      "icon": "Code2",            // Lucide \u56FE\u6807\u540D
      "labelKey": "plugins.myPanel",
      "labelDefault": "\u6211\u7684\u9762\u677F",
      "order": 85
    }],
    "mcpServers": [{
      "id": "my-server",
      "transport": "stdio",       // \u56FA\u5B9A: "stdio"
      "command": "node",
      "argsTemplate": ["{{pluginDir}}/mcp/server.js"]
    }],
    "panel": {
      "entry": "./dist/panel.js"  // \u9762\u677F JS bundle \u8DEF\u5F84
    }
  },

  "permissions": {
    "workspaceRead": true,        // \u8BFB\u53D6\u5DE5\u4F5C\u533A\u6587\u4EF6
    "workspaceWrite": false,      // \u5199\u5165\u5DE5\u4F5C\u533A\u6587\u4EF6
    "appConfigRead": false,       // \u8BFB\u53D6\u5E94\u7528\u914D\u7F6E
    "appConfigWrite": false,      // \u5199\u5165\u5E94\u7528\u914D\u7F6E
    "network": false,             // \u7F51\u7EDC\u8BBF\u95EE
    "aiToolAccess": true          // AI \u5DE5\u5177\u8C03\u7528
  },

  "origin": {
    "repository": "https://github.com/user/repo",
    "homepage": "https://example.com",
    "updateUrl": "https://example.com/update.json",
    "downloadUrl": "https://example.com/plugin.zip"
  }
}

### \u6A21\u677F\u5360\u4F4D\u7B26

{{pluginDir}}     \u2014 \u63D2\u4EF6\u5B89\u88C5\u76EE\u5F55
{{workspacePath}}  \u2014 \u5F53\u524D\u5DE5\u4F5C\u533A\u8DEF\u5F84
{{appConfigDir}}   \u2014 \u5E94\u7528\u914D\u7F6E\u76EE\u5F55

### \u53EF\u7528\u56FE\u6807

Files, GitPullRequest, CheckSquare, Languages, Clock, Target,
ClipboardList, Terminal, Code2, Bot, BookOpen, AlertCircle, Film, Activity

---

## MCP Server \u5F00\u53D1

### \u5FC5\u987B\u5904\u7406\u7684\u65B9\u6CD5

initialize      \u2014 \u8FD4\u56DE\u534F\u8BAE\u7248\u672C\u548C\u80FD\u529B\u58F0\u660E
tools/list      \u2014 \u8FD4\u56DE\u5DE5\u5177\u5217\u8868
tools/call      \u2014 \u6267\u884C\u5DE5\u5177\u8C03\u7528\uFF0C\u8FD4\u56DE\u7ED3\u679C

### \u6210\u529F\u54CD\u5E94

{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "\u8F93\u51FA\u5185\u5BB9" }]
  }
}

### \u9519\u8BEF\u54CD\u5E94

{
  "content": [{ "type": "text", "text": "\u9519\u8BEF\u4FE1\u606F" }],
  "isError": true
}

---

## \u53EF\u89C6\u5316\u9762\u677F\u5F00\u53D1

### \u76EE\u5F55\u7ED3\u6784

my-plugin/
\u251C\u2500\u2500 plugin.json
\u251C\u2500\u2500 src/
\u2502   \u2514\u2500\u2500 Panel.tsx          # \u9762\u677F\u6E90\u7801\uFF08React\uFF09
\u251C\u2500\u2500 dist/
\u2502   \u2514\u2500\u2500 panel.js           # \u6253\u5305\u8F93\u51FA\uFF08\u81EA\u5305\u542B\uFF09
\u2514\u2500\u2500 mcp/
    \u2514\u2500\u2500 server.js

### src/Panel.tsx

import { useState } from 'react'

interface PluginPanelProps {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}

export default function MyPanel({ pluginId, onSendToChat }: PluginPanelProps) {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>\u6211\u7684\u9762\u677F</h3>
      <div style={{ fontSize: 11, color: 'rgb(var(--c-text-tertiary))' }}>\u63D2\u4EF6: {pluginId}</div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        style={{ flex: 1, minHeight: 80, padding: 8, borderRadius: 6,
          border: '1px solid rgb(var(--c-border) / 0.25)', background: 'rgb(var(--c-bg-surface))', color: 'rgb(var(--c-text-primary))',
          fontFamily: 'monospace', fontSize: 12 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setOutput(input)}
          style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgb(var(--c-border) / 0.25)',
            background: 'rgb(var(--c-bg-hover))', color: 'rgb(var(--c-text-secondary))', fontSize: 12 }}>
          \u5904\u7406
        </button>
        {onSendToChat && (
          <button onClick={() => onSendToChat('\u5904\u7406: ' + input)}
            style={{ padding: '6px 12px', borderRadius: 6, border: 'none',
              background: 'rgb(var(--c-primary))', color: 'rgb(var(--c-on-primary))', fontSize: 12 }}>
            \u53D1\u9001\u5230\u804A\u5929
          </button>
        )}
      </div>
      {output && (
        <pre style={{ padding: 8, borderRadius: 6, border: '1px solid rgb(var(--c-border) / 0.25)',
          background: 'rgb(var(--c-bg-surface))', color: 'rgb(var(--c-text-secondary))', fontFamily: 'monospace',
          fontSize: 12, margin: 0, overflow: 'auto' }}>
          {output}
        </pre>
      )}
    </div>
  )
}

### \u6253\u5305\u547D\u4EE4

npx esbuild src/Panel.tsx --bundle --format=esm --outfile=dist/panel.js --jsx=automatic --nodePaths=/path/to/polaris/node_modules

### \u9762\u677F Props

pluginId       \u2014 \u5F53\u524D\u63D2\u4EF6 ID
onSendToChat() \u2014 \u53D1\u9001\u6D88\u606F\u5230\u804A\u5929

---

## \u5185\u7F6E\u63D2\u4EF6\u5F00\u53D1

### src/plugins/myPlugin/manifest.ts

import type { PolarisPluginManifest } from '../pluginSystemTypes'

export const myPluginManifest: PolarisPluginManifest = {
  id: 'polaris.myPlugin',
  name: '\u6211\u7684\u63D2\u4EF6',
  version: '0.1.0',
  description: '\u63D2\u4EF6\u63CF\u8FF0',
  builtin: true,
  enabledByDefault: true,
  contributes: {
    views: [{
      id: 'myPlugin.panel',
      area: 'activityBar',
      panelType: 'myPanelType',
      icon: 'Bot',
      labelKey: 'labels.myPanel',
      labelDefault: '\u6211\u7684\u9762\u677F',
      order: 85,
    }],
    mcpServers: [{
      id: 'my-mcp-server',
      transport: 'stdio',
      command: 'my_mcp_command',
      argsTemplate: ['{{appConfigDir}}', '{{workspacePath}}'],
    }],
  },
  permissions: { workspaceRead: true, aiToolAccess: true },
}

### \u5728 src/plugin-system/builtinPlugins.ts \u4E2D\u6CE8\u518C

import { myPluginManifest } from '@/plugins/myPlugin/manifest'

export function registerBuiltinPlugins(): void {
  pluginRegistry.register(corePluginManifest)
  pluginRegistry.register(myPluginManifest)
}

---

## \u5B89\u88C5\u4E0E\u8C03\u8BD5

### \u5B89\u88C5\u65B9\u5F0F

\u672C\u5730\u76EE\u5F55\uFF1A\u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Install from directory
\u5305\u6587\u4EF6\uFF1A  \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Install package\uFF08.zip/.json\uFF09
\u8FDC\u7A0B URL\uFF1A\u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 \u8F93\u5165 URL \u2192 Install remote

### \u5B89\u88C5\u8DEF\u5F84

\u7528\u6237\u7EA7\uFF1A%APPDATA%/com.polaris.app/plugins/\uFF08Windows\uFF09
         ~/.config/polaris/plugins/\uFF08Linux/Mac\uFF09
\u9879\u76EE\u7EA7\uFF1A\u5DE5\u4F5C\u533A\u6839\u76EE\u5F55 .polaris/plugins/

### \u8C03\u8BD5\u6280\u5DE7

- \u624B\u52A8\u8FD0\u884C MCP Server\uFF1Anode mcp/server.js
- \u6D4F\u89C8\u5668 DevTools \u4E2D\u67E5\u770B blob URL \u5BF9\u5E94\u6E90\u7801
- "Manifest diagnostics" \u663E\u793A\u6821\u9A8C\u9519\u8BEF
- \u4FEE\u6539 plugin.json \u540E\u70B9\u51FB Refresh \u5237\u65B0

---

## \u5E38\u89C1\u95EE\u9898

\u95EE\uFF1A\u9762\u677F\u62A5\u9519 "Invalid hook call"
\u7B54\uFF1A\u9762\u677F bundle \u5185\u5D4C\u4E86\u72EC\u7ACB\u7684 React \u526F\u672C\u3002\u91CD\u65B0\u6253\u5305\u65F6 React \u8BBE\u4E3A external\uFF0C\u8FD0\u884C\u65F6\u7531\u5BBF\u4E3B\u63D0\u4F9B\u3002

\u95EE\uFF1A\u9762\u677F\u62A5\u9519 "Failed to fetch"
\u7B54\uFF1A\u4E0D\u80FD\u7528 import() \u52A0\u8F7D file:// URL\u3002\u4F7F\u7528 Polaris \u6CE8\u518C\u8868\u7CFB\u7EDF\uFF0C\u901A\u8FC7 Tauri \u540E\u7AEF\u8BFB\u53D6\u6587\u4EF6\u3002

\u95EE\uFF1AMCP Server \u542F\u52A8\u5931\u8D25
\u7B54\uFF1A\u68C0\u67E5\uFF1Acommand \u662F\u5426\u5728 PATH \u4E2D\u3001argsTemplate \u8DEF\u5F84\u662F\u5426\u6B63\u786E\u3001\u811A\u672C\u662F\u5426\u6709\u6267\u884C\u6743\u9650\u3001\u624B\u52A8\u8FD0\u884C\u662F\u5426\u62A5\u9519\u3002

---

\u5B8C\u6574\u6587\u6863\uFF1Adocs/plugins/plugin-development-guide.md`;
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(guideContent);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = guideContent;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };
  return /* @__PURE__ */ jsxs15("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxs15("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsx15("span", { className: "text-xs text-text-tertiary", children: "\u590D\u5236\u4EE5\u4E0B\u5168\u90E8\u5185\u5BB9\uFF0C\u7C98\u8D34\u7ED9 AI \u52A9\u624B\uFF08\u5982 Claude Code\uFF09\u5373\u53EF\u751F\u6210\u63D2\u4EF6\u3002" }),
      /* @__PURE__ */ jsx15(
        "button",
        {
          type: "button",
          onClick: handleCopy,
          className: "inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary hover:bg-primary/15 transition-colors shrink-0",
          children: copied ? /* @__PURE__ */ jsxs15(Fragment2, { children: [
            /* @__PURE__ */ jsx15(Check, { size: 12 }),
            " \u5DF2\u590D\u5236"
          ] }) : /* @__PURE__ */ jsxs15(Fragment2, { children: [
            /* @__PURE__ */ jsx15(Copy, { size: 12 }),
            " \u590D\u5236\u5168\u90E8"
          ] })
        }
      )
    ] }),
    /* @__PURE__ */ jsx15("pre", { className: "rounded-lg border border-border-subtle bg-background-elevated p-3 text-[11px] font-mono text-text-tertiary overflow-auto max-h-[500px] whitespace-pre-wrap leading-relaxed", children: guideContent })
  ] });
}
function PluginTab() {
  const { t: t2 } = useTranslation("settings");
  const [mcpHealthStatuses, setMcpHealthStatuses] = useState10([]);
  const [mcpHealthLoading, setMcpHealthLoading] = useState10(false);
  const [mcpHealthError, setMcpHealthError] = useState10(null);
  const [pluginDiscoveryLoading, setPluginDiscoveryLoading] = useState10(false);
  const [pluginDiscoveryError, setPluginDiscoveryError] = useState10(null);
  const [pluginDiscoveryIssues, setPluginDiscoveryIssues] = useState10([]);
  const [pluginInstallLocations, setPluginInstallLocations] = useState10(null);
  const [pluginOperationLoading, setPluginOperationLoading] = useState10(false);
  const [pluginOperationMessage, setPluginOperationMessage] = useState10(null);
  const [pluginUpdateChecks, setPluginUpdateChecks] = useState10({});
  const [pluginUpdateLoadingId, setPluginUpdateLoadingId] = useState10(null);
  const [pluginUpdateApplyLoadingId, setPluginUpdateApplyLoadingId] = useState10(null);
  const [pluginInstallScope, setPluginInstallScope] = useState10("user");
  const [pluginRemoteSourceUrl, setPluginRemoteSourceUrl] = useState10("");
  const [plugins, setPlugins] = useState10(() => pluginRegistry.listPlugins());
  const [expandedPlugins, setExpandedPlugins] = useState10(/* @__PURE__ */ new Set());
  const [showGuide, setShowGuide] = useState10(false);
  const [marketplaceInstalling, setMarketplaceInstalling] = useState10(false);
  const [aiToolsByPlugin, setAiToolsByPlugin] = useState10({});
  const [aiToolsLoading, setAiToolsLoading] = useState10({});
  const [aiToolsError, setAiToolsError] = useState10({});
  const currentWorkspacePath = useWorkspaceStore((state) => state.getCurrentWorkspace()?.path);
  const pluginStates = usePluginStore((state) => state.pluginStates);
  const setPluginEnabled = usePluginStore((state) => state.setPluginEnabled);
  const setPluginUiEnabled = usePluginStore((state) => state.setPluginUiEnabled);
  const setPluginMcpEnabled = usePluginStore((state) => state.setPluginMcpEnabled);
  const setPluginMcpServerEnabled = usePluginStore((state) => state.setPluginMcpServerEnabled);
  const resetPluginState = usePluginStore((state) => state.resetPluginState);
  const handleSetPluginMcpEnabled = useCallback4((pluginId, enabled) => {
    setPluginMcpEnabled(pluginId, enabled);
    pluginRegistry.reRegisterPluginEngines(pluginId);
  }, [setPluginMcpEnabled]);
  const refreshAiTools = useCallback4(async (pluginId) => {
    setAiToolsLoading((prev) => ({ ...prev, [pluginId]: true }));
    setAiToolsError((prev) => ({ ...prev, [pluginId]: null }));
    try {
      const result = await listPluginTools(pluginId);
      if (!result.ok) {
        setAiToolsError((prev) => ({ ...prev, [pluginId]: result.error ?? "list_plugin_tools \u5931\u8D25" }));
        return;
      }
      setAiToolsByPlugin((prev) => ({ ...prev, [pluginId]: result.servers }));
    } catch (error) {
      setAiToolsError((prev) => ({ ...prev, [pluginId]: error instanceof Error ? error.message : String(error) }));
    } finally {
      setAiToolsLoading((prev) => ({ ...prev, [pluginId]: false }));
    }
  }, []);
  const handleToggleAiTool = useCallback4(async (pluginId, tool, enabled) => {
    const result = await setPluginTools(pluginId, enabled, [tool]);
    if (!result.ok) {
      setAiToolsError((prev) => ({ ...prev, [pluginId]: result.error ?? "set_plugin_tools \u5931\u8D25" }));
      return;
    }
    setAiToolsByPlugin((prev) => ({
      ...prev,
      [pluginId]: (prev[pluginId] ?? []).map((server) => ({
        ...server,
        toolGates: server.tools.includes(tool) ? { ...server.toolGates, [tool]: enabled } : server.toolGates
      }))
    }));
  }, []);
  const discoveredPluginCount = plugins.filter((plugin) => !plugin.builtin).length;
  const marketplaceInstalled = plugins.some((plugin) => plugin.id === MARKETPLACE_PLUGIN_ID);
  const mcpServerStatuses = listPluginMcpServerStatuses(pluginStates);
  const enabledMcpServerCount = mcpServerStatuses.filter((server) => server.enabled).length;
  const disabledMcpServerCount = mcpServerStatuses.length - enabledMcpServerCount;
  const mcpHealthByName = useMemo5(() => {
    return new Map(mcpHealthStatuses.map((status) => [status.name, status]));
  }, [mcpHealthStatuses]);
  const toggleExpand = useCallback4((pluginId) => {
    setExpandedPlugins((prev) => {
      const next = new Set(prev);
      if (next.has(pluginId)) {
        next.delete(pluginId);
      } else {
        next.add(pluginId);
      }
      return next;
    });
  }, []);
  const refreshMcpHealth = useCallback4(async () => {
    setMcpHealthLoading(true);
    setMcpHealthError(null);
    try {
      setMcpHealthStatuses(await listMcpHealthStatuses());
    } catch (error) {
      setMcpHealthError(error instanceof Error ? error.message : String(error));
      setMcpHealthStatuses([]);
    } finally {
      setMcpHealthLoading(false);
    }
  }, []);
  const refreshInstalledPlugins = useCallback4(async () => {
    setPluginDiscoveryLoading(true);
    setPluginDiscoveryError(null);
    try {
      const result = await discoverInstalledPlugins(currentWorkspacePath);
      await pluginRegistry.replaceInstalled(result.plugins);
      setPluginDiscoveryIssues(result.errors);
      setPlugins(pluginRegistry.listPlugins());
      try {
        const states = usePluginStore.getState().pluginStates;
        const enabledMap = {};
        for (const plugin of pluginRegistry.listPlugins()) {
          const st = states[plugin.id];
          enabledMap[plugin.id] = { enabled: st ? st.enabled : plugin.enabledByDefault };
        }
        const statuses = await pluginServiceManager.autoStartAll(enabledMap, currentWorkspacePath);
        if (statuses.length > 0) {
          usePluginServiceStore.getState().updateServiceStatuses(statuses);
        }
      } catch {
      }
    } catch (error) {
      setPluginDiscoveryError(error instanceof Error ? error.message : String(error));
      setPluginDiscoveryIssues([]);
    } finally {
      setPluginDiscoveryLoading(false);
    }
  }, [currentWorkspacePath]);
  const refreshInstallLocations = useCallback4(async () => {
    try {
      setPluginInstallLocations(await getPluginInstallLocations(currentWorkspacePath));
    } catch (error) {
      setPluginDiscoveryError(error instanceof Error ? error.message : String(error));
      setPluginInstallLocations(null);
    }
  }, [currentWorkspacePath]);
  const handleOpenInstallDirectory = useCallback4(async () => {
    const path = pluginInstallScope === "project" ? pluginInstallLocations?.projectPath : pluginInstallLocations?.userPath;
    if (!path) return;
    await openInDefaultApp(path);
  }, [pluginInstallLocations, pluginInstallScope]);
  const handleInstallLocalPlugin = useCallback4(async () => {
    if (!isTauri()) return;
    setPluginOperationMessage(null);
    try {
      const { open: open2 } = await Promise.resolve().then(() => (init_dist_js(), dist_js_exports));
      const selected = await open2({
        directory: true,
        multiple: false,
        title: t2("plugins.selectPluginDirectory", { defaultValue: "Select plugin directory" })
      });
      const sourcePath = Array.isArray(selected) ? selected[0] : selected;
      if (!sourcePath) return;
      setPluginOperationLoading(true);
      const result = await installLocalPlugin(sourcePath, pluginInstallScope, currentWorkspacePath);
      if (!result.success) {
        setPluginOperationMessage(result.error ?? t2("plugins.installFailed", { defaultValue: "Plugin install failed" }));
        return;
      }
      setPluginOperationMessage(result.message ?? t2("plugins.installSucceeded", { defaultValue: "Plugin installed" }));
      await refreshInstalledPlugins();
      await refreshInstallLocations();
    } catch (error) {
      setPluginOperationMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPluginOperationLoading(false);
    }
  }, [currentWorkspacePath, pluginInstallScope, refreshInstallLocations, refreshInstalledPlugins, t2]);
  const handleInstallPluginPackage = useCallback4(async () => {
    if (!isTauri()) return;
    setPluginOperationMessage(null);
    try {
      const { open: open2 } = await Promise.resolve().then(() => (init_dist_js(), dist_js_exports));
      const selected = await open2({
        directory: false,
        multiple: false,
        filters: [
          { name: "Plugin package", extensions: ["zip", "json"] }
        ],
        title: t2("plugins.selectPluginPackage", { defaultValue: "Select plugin package" })
      });
      const packagePath = Array.isArray(selected) ? selected[0] : selected;
      if (!packagePath) return;
      setPluginOperationLoading(true);
      const result = await installPluginPackage(packagePath, pluginInstallScope, currentWorkspacePath);
      if (!result.success) {
        setPluginOperationMessage(result.error ?? t2("plugins.installFailed", { defaultValue: "Plugin install failed" }));
        return;
      }
      setPluginOperationMessage(result.message ?? t2("plugins.installSucceeded", { defaultValue: "Plugin installed" }));
      await refreshInstalledPlugins();
      await refreshInstallLocations();
    } catch (error) {
      setPluginOperationMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPluginOperationLoading(false);
    }
  }, [currentWorkspacePath, pluginInstallScope, refreshInstallLocations, refreshInstalledPlugins, t2]);
  const handleInstallRemotePlugin = useCallback4(async () => {
    const sourceUrl = pluginRemoteSourceUrl.trim();
    if (!sourceUrl) return;
    setPluginOperationLoading(true);
    setPluginOperationMessage(null);
    try {
      const result = await installRemotePlugin(sourceUrl, pluginInstallScope, currentWorkspacePath);
      if (!result.success) {
        setPluginOperationMessage(result.error ?? t2("plugins.installFailed", { defaultValue: "Plugin install failed" }));
        return;
      }
      setPluginRemoteSourceUrl("");
      setPluginOperationMessage(result.message ?? t2("plugins.installSucceeded", { defaultValue: "Plugin installed" }));
      await refreshInstalledPlugins();
      await refreshInstallLocations();
    } catch (error) {
      setPluginOperationMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPluginOperationLoading(false);
    }
  }, [currentWorkspacePath, pluginInstallScope, pluginRemoteSourceUrl, refreshInstallLocations, refreshInstalledPlugins, t2]);
  const handleInstallMarketplace = useCallback4(async () => {
    setMarketplaceInstalling(true);
    setPluginOperationMessage(null);
    try {
      const result = await installRemotePlugin(MARKETPLACE_DOWNLOAD_URL, pluginInstallScope, currentWorkspacePath);
      if (!result.success) {
        setPluginOperationMessage(result.error ?? t2("plugins.installFailed", { defaultValue: "Plugin install failed" }));
        return;
      }
      setPluginOperationMessage(result.message ?? t2("plugins.marketplaceInstallSucceeded", { defaultValue: "Marketplace installed" }));
      await refreshInstalledPlugins();
      await refreshInstallLocations();
    } catch (error) {
      setPluginOperationMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setMarketplaceInstalling(false);
    }
  }, [currentWorkspacePath, pluginInstallScope, refreshInstallLocations, refreshInstalledPlugins, t2]);
  const handleUninstallLocalPlugin = useCallback4(async (pluginId, installPath) => {
    if (!installPath) return;
    const isDev = plugins.find((p) => p.id === pluginId)?.dev != null;
    const confirmed = window.confirm(t2("plugins.uninstallConfirm", {
      defaultValue: isDev ? "Remove dev plugin {{pluginId}}? Only the link is removed \u2014 the source directory is kept untouched." : "Uninstall plugin {{pluginId}}? This removes its installed directory and kills all associated processes.",
      pluginId
    }));
    if (!confirmed) return;
    setPluginOperationLoading(true);
    setPluginOperationMessage(isDev ? t2("plugins.uninstallingDev", { defaultValue: "Removing dev link (source directory preserved)..." }) : t2("plugins.uninstalling", { defaultValue: "Stopping processes and removing plugin..." }));
    try {
      const result = await uninstallPluginWithCleanup(installPath, pluginId, currentWorkspacePath);
      if (!result.success) {
        setPluginOperationMessage(result.error ?? t2("plugins.uninstallFailed", { defaultValue: "Plugin uninstall failed" }));
        return;
      }
      try {
        const serviceStore = usePluginServiceStore.getState();
        serviceStore.clearPluginServiceStatuses(pluginId);
      } catch {
      }
      resetPluginState(pluginId);
      setPluginOperationMessage(result.message ?? t2("plugins.uninstallSucceeded", { defaultValue: "Plugin uninstalled" }));
      await refreshInstalledPlugins();
      await refreshInstallLocations();
    } catch (error) {
      setPluginOperationMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPluginOperationLoading(false);
    }
  }, [currentWorkspacePath, plugins, refreshInstallLocations, refreshInstalledPlugins, resetPluginState, t2]);
  const handleDevLinkPlugin = useCallback4(async () => {
    if (!isTauri()) return;
    setPluginOperationMessage(null);
    try {
      const { open: open2 } = await Promise.resolve().then(() => (init_dist_js(), dist_js_exports));
      const selected = await open2({
        directory: true,
        multiple: false,
        title: t2("plugins.selectDevPluginDirectory", {
          defaultValue: "\u9009\u62E9\u63D2\u4EF6\u6E90\u7801\u76EE\u5F55\uFF08\u9700\u542B plugin.json\uFF09"
        })
      });
      const sourcePath = Array.isArray(selected) ? selected[0] : selected;
      if (!sourcePath) return;
      setPluginOperationLoading(true);
      const result = await devLinkPlugin(sourcePath);
      if (!result.success) {
        setPluginOperationMessage(result.error ?? t2("plugins.devLinkFailed", { defaultValue: "dev-link \u6CE8\u518C\u5931\u8D25" }));
        return;
      }
      setPluginOperationMessage(result.message ?? t2("plugins.devLinkSucceeded", { defaultValue: "dev-link \u5DF2\u6CE8\u518C" }));
      await refreshInstalledPlugins();
    } catch (error) {
      setPluginOperationMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPluginOperationLoading(false);
    }
  }, [refreshInstalledPlugins, t2]);
  const handleForceUninstallPlugin = useCallback4(async (pluginId, installPath) => {
    if (!installPath) return;
    const confirmed = window.confirm(t2("plugins.forceUninstallConfirm", {
      defaultValue: "Force uninstall plugin {{pluginId}}? Plugin directory may remain but will be renamed. This cannot be undone.",
      pluginId
    }));
    if (!confirmed) return;
    setPluginOperationLoading(true);
    setPluginOperationMessage(t2("plugins.forceUninstalling", { defaultValue: "Force uninstalling plugin..." }));
    try {
      const result = await forceUninstallPlugin(installPath, currentWorkspacePath);
      if (!result.success) {
        setPluginOperationMessage(result.error ?? t2("plugins.uninstallFailed", { defaultValue: "Force uninstall failed" }));
        return;
      }
      try {
        const serviceStore = usePluginServiceStore.getState();
        serviceStore.clearPluginServiceStatuses(pluginId);
      } catch {
      }
      resetPluginState(pluginId);
      setPluginOperationMessage(result.message ?? t2("plugins.forceUninstallSucceeded", { defaultValue: "Force uninstall completed" }));
      await refreshInstalledPlugins();
      await refreshInstallLocations();
    } catch (error) {
      setPluginOperationMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPluginOperationLoading(false);
    }
  }, [currentWorkspacePath, refreshInstallLocations, refreshInstalledPlugins, resetPluginState, t2]);
  const handleCheckPluginUpdate = useCallback4(async (pluginId, installPath) => {
    if (!installPath) return;
    setPluginOperationMessage(null);
    setPluginUpdateLoadingId(pluginId);
    try {
      const result = await checkPluginUpdate(installPath);
      setPluginUpdateChecks((checks) => ({ ...checks, [pluginId]: result }));
      if (result.error) {
        setPluginOperationMessage(result.error);
      }
    } catch (error) {
      setPluginOperationMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPluginUpdateLoadingId(null);
    }
  }, []);
  const handleApplyPluginUpdate = useCallback4(async (pluginId, installPath) => {
    if (!installPath) return;
    const confirmed = window.confirm(t2("plugins.applyUpdateConfirm", {
      defaultValue: "Apply update for plugin {{pluginId}}? This replaces its installed directory.",
      pluginId
    }));
    if (!confirmed) return;
    setPluginUpdateApplyLoadingId(pluginId);
    setPluginOperationMessage(null);
    try {
      const result = await applyPluginUpdate(installPath, currentWorkspacePath);
      if (!result.success) {
        setPluginOperationMessage(result.error ?? t2("plugins.updateApplyFailed", { defaultValue: "Plugin update failed" }));
        return;
      }
      setPluginOperationMessage(result.message ?? t2("plugins.updateApplySucceeded", { defaultValue: "Plugin updated" }));
      setPluginUpdateChecks((checks) => {
        const next = { ...checks };
        delete next[pluginId];
        return next;
      });
      await refreshInstalledPlugins();
      await refreshInstallLocations();
    } catch (error) {
      setPluginOperationMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPluginUpdateApplyLoadingId(null);
    }
  }, [currentWorkspacePath, refreshInstallLocations, refreshInstalledPlugins, t2]);
  useEffect9(() => {
    refreshMcpHealth();
  }, [refreshMcpHealth]);
  useEffect9(() => {
    refreshInstallLocations();
  }, [refreshInstallLocations]);
  return /* @__PURE__ */ jsxs15("div", { className: "space-y-3", children: [
    !marketplaceInstalled && /* @__PURE__ */ jsxs15("div", { className: "flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5", children: [
      /* @__PURE__ */ jsxs15("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsx15("div", { className: "text-xs font-medium text-text-primary", children: t2("plugins.marketplaceBannerTitle", { defaultValue: "Polaris \u63D2\u4EF6\u5546\u57CE" }) }),
        /* @__PURE__ */ jsx15("div", { className: "text-[11px] text-text-tertiary", children: t2("plugins.marketplaceBannerDesc", { defaultValue: "\u6D4F\u89C8\u3001\u641C\u7D22\u5E76\u4E00\u952E\u5B89\u88C5\u793E\u533A\u63D2\u4EF6\uFF0C\u7BA1\u7406\u4E0E\u66F4\u65B0\u5DF2\u88C5\u63D2\u4EF6\u3002" }) })
      ] }),
      /* @__PURE__ */ jsxs15(
        "button",
        {
          type: "button",
          onClick: handleInstallMarketplace,
          disabled: marketplaceInstalling || pluginOperationLoading || pluginInstallScope === "project" && !currentWorkspacePath,
          className: "inline-flex shrink-0 items-center gap-1 rounded border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
          children: [
            /* @__PURE__ */ jsx15(PackagePlus, { size: 12 }),
            marketplaceInstalling ? t2("plugins.marketplaceInstalling", { defaultValue: "Installing..." }) : t2("plugins.marketplaceInstall", { defaultValue: "Install" })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs15("div", { className: "rounded-lg border border-border-subtle bg-background-surface p-3 space-y-2", children: [
      /* @__PURE__ */ jsxs15("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxs15("div", { className: "flex items-center gap-3 text-xs text-text-tertiary", children: [
          pluginDiscoveryError ? /* @__PURE__ */ jsx15("span", { className: "text-danger", children: t2("plugins.discoveryError", { defaultValue: "Discovery failed", error: pluginDiscoveryError }) }) : /* @__PURE__ */ jsx15("span", { children: t2("plugins.discoverySummary", { defaultValue: "{{count}} installed, {{issues}} diagnostics", count: discoveredPluginCount, issues: pluginDiscoveryIssues.length }) }),
          /* @__PURE__ */ jsx15("span", { className: "text-border-subtle", children: "|" }),
          mcpHealthError ? /* @__PURE__ */ jsx15("span", { className: "text-danger", children: t2("plugins.mcpHealthError", { defaultValue: "MCP unavailable", error: mcpHealthError }) }) : /* @__PURE__ */ jsx15("span", { children: t2("plugins.mcpRuntimeSummary", { defaultValue: "MCP: {{enabled}} on, {{disabled}} off", enabled: enabledMcpServerCount, disabled: disabledMcpServerCount }) })
        ] }),
        /* @__PURE__ */ jsxs15(
          "button",
          {
            type: "button",
            onClick: () => {
              refreshInstalledPlugins();
              refreshMcpHealth();
            },
            disabled: pluginDiscoveryLoading || mcpHealthLoading,
            className: "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-background-hover disabled:cursor-not-allowed disabled:opacity-50",
            children: [
              /* @__PURE__ */ jsx15(RefreshCw, { size: 12, className: pluginDiscoveryLoading || mcpHealthLoading ? "animate-spin" : "" }),
              t2("plugins.refreshDiscovery", { defaultValue: "Refresh" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs15("div", { className: "flex flex-wrap items-center gap-2 text-xs", children: [
        /* @__PURE__ */ jsxs15("span", { className: "text-text-tertiary", children: [
          t2("plugins.installDirectoryTitle", { defaultValue: "Dir" }),
          ":"
        ] }),
        /* @__PURE__ */ jsx15("span", { className: "max-w-[280px] truncate text-text-secondary", children: pluginInstallScope === "project" ? pluginInstallLocations?.projectPath ?? t2("plugins.projectInstallUnavailable", { defaultValue: "Open a workspace" }) : pluginInstallLocations?.userPath ?? t2("plugins.installLocationsUnavailable", { defaultValue: "Unavailable" }) }),
        /* @__PURE__ */ jsxs15(
          "select",
          {
            value: pluginInstallScope,
            onChange: (event) => setPluginInstallScope(event.target.value),
            className: "rounded border border-border-subtle bg-background-surface px-1.5 py-1 text-xs text-text-secondary",
            children: [
              /* @__PURE__ */ jsx15("option", { value: "user", children: t2("plugins.userInstallScope", { defaultValue: "User" }) }),
              /* @__PURE__ */ jsx15("option", { value: "project", disabled: !currentWorkspacePath, children: t2("plugins.projectInstallScope", { defaultValue: "Project" }) })
            ]
          }
        ),
        /* @__PURE__ */ jsxs15(
          "button",
          {
            type: "button",
            onClick: handleOpenInstallDirectory,
            disabled: pluginInstallScope === "project" && !pluginInstallLocations?.projectPath,
            className: "inline-flex items-center gap-1 rounded border border-border-subtle px-2 py-1 text-xs text-text-secondary hover:bg-background-hover disabled:cursor-not-allowed disabled:opacity-50",
            children: [
              /* @__PURE__ */ jsx15(FolderOpen, { size: 11 }),
              t2("plugins.openInstallDirectory", { defaultValue: "Open" })
            ]
          }
        ),
        /* @__PURE__ */ jsxs15(
          "button",
          {
            type: "button",
            onClick: handleInstallLocalPlugin,
            disabled: pluginOperationLoading || !isTauri() || pluginInstallScope === "project" && !currentWorkspacePath,
            className: "inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50",
            children: [
              /* @__PURE__ */ jsx15(PackagePlus, { size: 11 }),
              t2("plugins.installFromDirectory", { defaultValue: "Install dir" })
            ]
          }
        ),
        /* @__PURE__ */ jsxs15(
          "button",
          {
            type: "button",
            onClick: handleInstallPluginPackage,
            disabled: pluginOperationLoading || !isTauri() || pluginInstallScope === "project" && !currentWorkspacePath,
            className: "inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50",
            children: [
              /* @__PURE__ */ jsx15(PackagePlus, { size: 11 }),
              t2("plugins.installFromPackage", { defaultValue: "Install pkg" })
            ]
          }
        ),
        /* @__PURE__ */ jsxs15(
          "button",
          {
            type: "button",
            onClick: handleDevLinkPlugin,
            disabled: pluginOperationLoading || !isTauri(),
            title: t2("plugins.devLinkHint", {
              defaultValue: "\u6E90\u7801\u76F4\u8FDE\uFF08\u5F00\u53D1\u7528\uFF09\uFF1A\u6539 mcp/server.js \u7B49\u6E90\u7801\u540E\u65B0\u4F1A\u8BDD\u5373\u751F\u6548\uFF0C\u65E0\u9700\u6253\u5305\u91CD\u88C5\uFF1B\u5378\u8F7D\u4EC5\u79FB\u9664\u94FE\u63A5\u3001\u4FDD\u7559\u6E90\u7801"
            }),
            className: "inline-flex items-center gap-1 rounded border border-border-subtle px-2 py-1 text-xs text-text-secondary hover:bg-background-hover disabled:cursor-not-allowed disabled:opacity-50",
            children: [
              /* @__PURE__ */ jsx15(Link2, { size: 11 }),
              t2("plugins.devLink", { defaultValue: "Dev link" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs15("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx15(
          "input",
          {
            type: "text",
            value: pluginRemoteSourceUrl,
            onChange: (event) => setPluginRemoteSourceUrl(event.target.value),
            placeholder: t2("plugins.remoteSourcePlaceholder", { defaultValue: "Remote manifest or package URL" }),
            className: "min-w-0 flex-1 rounded border border-border-subtle bg-background-elevated px-2 py-1 text-xs text-text-secondary placeholder:text-text-muted"
          }
        ),
        /* @__PURE__ */ jsxs15(
          "button",
          {
            type: "button",
            onClick: handleInstallRemotePlugin,
            disabled: pluginOperationLoading || !pluginRemoteSourceUrl.trim() || pluginInstallScope === "project" && !currentWorkspacePath,
            className: "inline-flex items-center gap-1 rounded border border-border-subtle px-2 py-1 text-xs text-text-secondary hover:bg-background-hover disabled:cursor-not-allowed disabled:opacity-50",
            children: [
              /* @__PURE__ */ jsx15(PackagePlus, { size: 11 }),
              t2("plugins.installRemote", { defaultValue: "Remote" })
            ]
          }
        )
      ] }),
      pluginOperationMessage && /* @__PURE__ */ jsx15("div", { className: "text-xs text-text-tertiary", children: pluginOperationMessage })
    ] }),
    pluginDiscoveryIssues.length > 0 && /* @__PURE__ */ jsxs15("div", { className: "flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2", children: [
      /* @__PURE__ */ jsx15(TriangleAlert, { size: 14, className: "mt-0.5 shrink-0 text-warning" }),
      /* @__PURE__ */ jsxs15("div", { className: "min-w-0 space-y-0.5", children: [
        /* @__PURE__ */ jsx15("div", { className: "text-xs font-medium text-warning", children: t2("plugins.discoveryIssuesTitle", { defaultValue: "Manifest diagnostics" }) }),
        pluginDiscoveryIssues.map((issue, index) => /* @__PURE__ */ jsxs15("div", { className: "text-[11px] text-text-tertiary", children: [
          /* @__PURE__ */ jsx15("span", { className: "text-text-secondary", children: issue.path }),
          " \u2014 ",
          issue.error
        ] }, `${issue.path}-${index}`))
      ] })
    ] }),
    /* @__PURE__ */ jsxs15("div", { className: "rounded-lg border border-border-subtle bg-background-surface", children: [
      /* @__PURE__ */ jsxs15(
        "button",
        {
          type: "button",
          onClick: () => setShowGuide(!showGuide),
          className: "flex w-full items-center gap-2 px-3 py-2 text-left",
          children: [
            /* @__PURE__ */ jsx15(BookOpen, { size: 14, className: "shrink-0 text-text-muted" }),
            /* @__PURE__ */ jsx15("span", { className: "flex-1 text-xs font-medium text-text-secondary", children: t2("plugins.guideTitle", { defaultValue: "Plugin Development Guide" }) }),
            showGuide ? /* @__PURE__ */ jsx15(ChevronDown, { size: 14, className: "text-text-muted" }) : /* @__PURE__ */ jsx15(ChevronRight, { size: 14, className: "text-text-muted" })
          ]
        }
      ),
      showGuide && /* @__PURE__ */ jsx15("div", { className: "border-t border-border-subtle px-3 py-3", children: /* @__PURE__ */ jsx15(PluginGuide, {}) })
    ] }),
    /* @__PURE__ */ jsx15("div", { className: "space-y-1", children: plugins.map((plugin) => /* @__PURE__ */ jsx15(
      PluginCard,
      {
        plugin,
        state: pluginStates[plugin.id] ?? {
          enabled: plugin.enabledByDefault,
          uiEnabled: true,
          mcpEnabled: true
        },
        expanded: expandedPlugins.has(plugin.id),
        onToggleExpand: toggleExpand,
        mcpServerStatuses: mcpServerStatuses.filter((server) => server.pluginId === plugin.id),
        mcpHealthByName,
        updateCheck: pluginUpdateChecks[plugin.id],
        updateLoadingId: pluginUpdateLoadingId,
        updateApplyLoadingId: pluginUpdateApplyLoadingId,
        onSetEnabled: setPluginEnabled,
        onSetUiEnabled: setPluginUiEnabled,
        onSetMcpEnabled: handleSetPluginMcpEnabled,
        onSetMcpServerEnabled: setPluginMcpServerEnabled,
        onReset: resetPluginState,
        onCheckUpdate: handleCheckPluginUpdate,
        onApplyUpdate: handleApplyPluginUpdate,
        onUninstall: handleUninstallLocalPlugin,
        onForceUninstall: handleForceUninstallPlugin,
        pluginStates,
        operationLoading: pluginOperationLoading,
        aiTools: aiToolsByPlugin[plugin.id] ?? [],
        aiToolsLoading: aiToolsLoading[plugin.id] ?? false,
        aiToolsError: aiToolsError[plugin.id] ?? null,
        onRefreshAiTools: refreshAiTools,
        onToggleAiTool: handleToggleAiTool,
        t: t2
      },
      plugin.id
    )) })
  ] });
}
function PluginCard({
  plugin,
  state,
  expanded,
  onToggleExpand,
  mcpServerStatuses,
  mcpHealthByName,
  updateCheck,
  updateLoadingId,
  updateApplyLoadingId,
  pluginStates,
  operationLoading,
  onSetEnabled,
  onSetUiEnabled,
  onSetMcpEnabled,
  onSetMcpServerEnabled,
  onReset,
  onCheckUpdate,
  onApplyUpdate,
  onUninstall,
  onForceUninstall,
  aiTools,
  aiToolsLoading,
  aiToolsError,
  onRefreshAiTools,
  onToggleAiTool,
  t: t2
}) {
  const isCorePlugin = plugin.id === "polaris.core";
  const views = plugin.contributes.views ?? [];
  const engines = plugin.contributes.engines ?? [];
  const capabilities = plugin.contributes.capabilities ?? [];
  const permissionEntries = Object.entries(plugin.permissions).filter(([, enabled]) => enabled);
  const originEntries = Object.entries(plugin.origin ?? {}).filter(([, value]) => typeof value === "string" && value.length > 0);
  const hasDetails = views.length > 0 || engines.length > 0 || mcpServerStatuses.length > 0 || permissionEntries.length > 0 || originEntries.length > 0 || capabilities.length > 0;
  return /* @__PURE__ */ jsxs15("div", { className: `rounded-lg border transition-colors ${expanded ? "border-border-subtle bg-background-surface" : "border-transparent hover:border-border-subtle hover:bg-background-surface/50"}`, children: [
    /* @__PURE__ */ jsxs15(
      "div",
      {
        className: `flex items-center gap-3 px-3 py-2.5 ${hasDetails ? "cursor-pointer select-none" : ""}`,
        onClick: () => hasDetails && onToggleExpand(plugin.id),
        children: [
          /* @__PURE__ */ jsx15("span", { className: "shrink-0 text-text-muted", children: hasDetails ? expanded ? /* @__PURE__ */ jsx15(ChevronDown, { size: 14 }) : /* @__PURE__ */ jsx15(ChevronRight, { size: 14 }) : /* @__PURE__ */ jsx15("span", { className: "inline-block w-[14px]" }) }),
          /* @__PURE__ */ jsxs15("div", { className: "min-w-0 flex-1", children: [
            /* @__PURE__ */ jsxs15("div", { className: "flex items-center gap-1.5 flex-wrap", children: [
              /* @__PURE__ */ jsx15("span", { className: "text-sm font-medium text-text-primary truncate", children: plugin.name }),
              /* @__PURE__ */ jsxs15("span", { className: "text-[10px] text-text-muted", children: [
                "v",
                plugin.version
              ] }),
              plugin.builtin && /* @__PURE__ */ jsx15("span", { className: "rounded-sm bg-primary/10 px-1 py-px text-[10px] leading-tight text-primary", children: t2("plugins.builtin") }),
              plugin.deprecated && /* @__PURE__ */ jsx15("span", { className: "rounded-sm bg-warning/10 px-1.5 py-px text-[10px] leading-tight text-warning", children: t2("plugins.deprecated", { defaultValue: "\u5DF2\u5E9F\u5F03" }) }),
              !plugin.builtin && plugin.source && /* @__PURE__ */ jsx15("span", { className: "rounded-sm bg-background-hover px-1 py-px text-[10px] leading-tight text-text-muted", children: plugin.source.kind === "project" ? t2("plugins.projectInstalled", { defaultValue: "Project" }) : t2("plugins.userInstalled", { defaultValue: "User" }) }),
              plugin.dev && /* @__PURE__ */ jsx15(
                "span",
                {
                  className: "rounded-sm bg-primary/15 px-1 py-px text-[10px] leading-tight text-primary",
                  title: t2("plugins.devBadgeHint", { defaultValue: "\u6E90\u7801\u76F4\u8FDE\uFF1A\u6539\u6E90\u7801\u65B0\u4F1A\u8BDD\u5373\u751F\u6548" }),
                  children: t2("plugins.devBadge", { defaultValue: "DEV" })
                }
              )
            ] }),
            plugin.description && /* @__PURE__ */ jsx15("div", { className: "mt-0.5 text-xs text-text-tertiary line-clamp-1", children: plugin.description })
          ] }),
          !expanded && /* @__PURE__ */ jsxs15("div", { className: "hidden sm:flex items-center gap-1.5 shrink-0", children: [
            views.length > 0 && /* @__PURE__ */ jsx15("span", { className: "text-[10px] text-text-muted", children: t2("plugins.viewCount", { defaultValue: "{{count}} views", count: views.length }) }),
            engines.length > 0 && /* @__PURE__ */ jsx15("span", { className: "text-[10px] text-text-muted", children: t2("plugins.engineCount", { defaultValue: "{{count}} \u5F15\u64CE", count: engines.length }) }),
            mcpServerStatuses.length > 0 && /* @__PURE__ */ jsx15("span", { className: "text-[10px] text-text-muted", children: t2("plugins.mcpCount", { defaultValue: "{{count}} MCP", count: mcpServerStatuses.length }) })
          ] }),
          /* @__PURE__ */ jsx15(
            "label",
            {
              className: "shrink-0 flex items-center gap-1.5 text-xs text-text-secondary",
              onClick: (e) => e.stopPropagation(),
              children: /* @__PURE__ */ jsx15(
                "input",
                {
                  type: "checkbox",
                  checked: state.enabled,
                  disabled: isCorePlugin,
                  onChange: (event) => onSetEnabled(plugin.id, event.target.checked),
                  className: "h-3.5 w-3.5 accent-primary"
                }
              )
            }
          )
        ]
      }
    ),
    expanded && /* @__PURE__ */ jsxs15("div", { className: "px-3 pb-3 space-y-3 border-t border-border-subtle", children: [
      /* @__PURE__ */ jsxs15("div", { className: "pt-2 space-y-0.5 text-[11px] text-text-muted", children: [
        /* @__PURE__ */ jsx15("div", { className: "font-mono", children: plugin.id }),
        !plugin.builtin && plugin.installPath && /* @__PURE__ */ jsx15("div", { className: "truncate", children: plugin.installPath }),
        plugin.dev && /* @__PURE__ */ jsxs15("div", { className: "truncate text-primary/80", children: [
          t2("plugins.devSourceLabel", { defaultValue: "dev source" }),
          ": ",
          plugin.dev.sourcePath
        ] }),
        originEntries.length > 0 && /* @__PURE__ */ jsx15("div", { className: "flex flex-wrap gap-x-3", children: originEntries.map(([key, value]) => /* @__PURE__ */ jsxs15("span", { children: [
          t2(`plugins.origin.${key}`, { defaultValue: key }),
          ": ",
          value
        ] }, key)) })
      ] }),
      isCorePlugin && /* @__PURE__ */ jsx15("div", { className: "rounded border border-border-subtle bg-background-elevated px-2.5 py-1.5 text-xs text-text-muted", children: t2("plugins.coreLocked") }),
      plugin.deprecated && /* @__PURE__ */ jsx15("div", { className: "rounded border border-warning/20 bg-warning/5 px-2.5 py-2 text-xs", children: /* @__PURE__ */ jsxs15("span", { className: "flex items-center gap-1.5 text-warning", children: [
        /* @__PURE__ */ jsx15(TriangleAlert, { size: 12 }),
        typeof plugin.deprecated === "string" ? plugin.deprecated : t2("plugins.deprecatedHint", { defaultValue: "\u6B64\u63D2\u4EF6\u5DF2\u5E9F\u5F03\uFF0C\u5373\u5C06\u79FB\u9664\uFF0C\u5EFA\u8BAE\u8FC1\u79FB\u81F3\u5176\u4ED6\u65B9\u6848" })
      ] }) }),
      /* @__PURE__ */ jsxs15("div", { className: "grid gap-2 sm:grid-cols-2 lg:grid-cols-4", children: [
        /* @__PURE__ */ jsxs15("div", { className: "rounded border border-border-subtle bg-background-elevated p-2.5", children: [
          /* @__PURE__ */ jsxs15("div", { className: "flex items-center justify-between mb-1.5", children: [
            /* @__PURE__ */ jsx15("span", { className: "text-xs font-medium text-text-secondary", children: t2("plugins.uiSurface", { defaultValue: "UI" }) }),
            /* @__PURE__ */ jsx15(
              "input",
              {
                type: "checkbox",
                checked: state.uiEnabled,
                disabled: !state.enabled || isCorePlugin,
                onChange: (event) => onSetUiEnabled(plugin.id, event.target.checked),
                className: "h-3.5 w-3.5 accent-primary"
              }
            )
          ] }),
          views.length > 0 ? /* @__PURE__ */ jsx15("div", { className: "flex flex-wrap gap-1", children: views.map((view) => {
            const Icon2 = getPluginIconComponent(view.icon, plugin.id);
            return /* @__PURE__ */ jsxs15(
              "span",
              {
                className: "inline-flex items-center gap-0.5 rounded-sm bg-background-surface px-1.5 py-0.5 text-[11px] text-text-secondary",
                children: [
                  /* @__PURE__ */ jsx15(Icon2, { size: 10 }),
                  t2(view.labelKey, { defaultValue: view.labelDefault ?? view.panelType })
                ]
              },
              view.id
            );
          }) }) : /* @__PURE__ */ jsx15("span", { className: "text-[11px] text-text-muted", children: t2("plugins.noViews", { defaultValue: "None" }) })
        ] }),
        /* @__PURE__ */ jsxs15("div", { className: "rounded border border-border-subtle bg-background-elevated p-2.5", children: [
          /* @__PURE__ */ jsxs15("div", { className: "flex items-center justify-between mb-1.5", children: [
            /* @__PURE__ */ jsx15("span", { className: "text-xs font-medium text-text-secondary", children: t2("plugins.mcpSurface", { defaultValue: "MCP" }) }),
            /* @__PURE__ */ jsxs15("label", { className: "flex items-center gap-1 text-[11px] text-text-muted", children: [
              t2("plugins.enableAllMcp", { defaultValue: "All" }),
              /* @__PURE__ */ jsx15(
                "input",
                {
                  type: "checkbox",
                  checked: state.mcpEnabled,
                  disabled: !state.enabled || mcpServerStatuses.length === 0 && engines.length === 0,
                  onChange: (event) => onSetMcpEnabled(plugin.id, event.target.checked),
                  className: "h-3.5 w-3.5 accent-primary"
                }
              )
            ] })
          ] }),
          mcpServerStatuses.length > 0 ? /* @__PURE__ */ jsx15("div", { className: "space-y-1", children: mcpServerStatuses.map((server) => {
            const runtime = mcpHealthByName.get(server.id);
            return /* @__PURE__ */ jsxs15("div", { className: "flex items-center justify-between gap-1 text-[11px]", children: [
              /* @__PURE__ */ jsxs15("div", { className: "min-w-0 flex-1", children: [
                /* @__PURE__ */ jsx15("span", { className: server.enabled ? "text-text-secondary" : "text-text-muted line-through", children: server.id }),
                /* @__PURE__ */ jsxs15("span", { className: "ml-1 text-text-muted", children: [
                  "[",
                  server.transport,
                  "]"
                ] }),
                server.enabled && runtime && /* @__PURE__ */ jsx15("span", { className: `ml-1 ${runtime.connected ? "text-success" : "text-warning"}`, children: runtime.connected ? "\u25CF" : "\u25CB" })
              ] }),
              /* @__PURE__ */ jsx15(
                "input",
                {
                  type: "checkbox",
                  checked: server.enabled,
                  disabled: !state.enabled || !state.mcpEnabled,
                  onChange: (event) => onSetMcpServerEnabled(plugin.id, server.id, event.target.checked),
                  className: "h-3 w-3 shrink-0 accent-primary"
                }
              )
            ] }, server.id);
          }) }) : /* @__PURE__ */ jsx15("span", { className: "text-[11px] text-text-muted", children: t2("plugins.noMcpServers", { defaultValue: "None" }) })
        ] }),
        /* @__PURE__ */ jsxs15("div", { className: "rounded border border-border-subtle bg-background-elevated p-2.5", children: [
          /* @__PURE__ */ jsxs15("div", { className: "flex items-center justify-between mb-1.5", children: [
            /* @__PURE__ */ jsx15("span", { className: "text-xs font-medium text-text-secondary", children: t2("plugins.aiToolsSurface", { defaultValue: "AI \u5DE5\u5177" }) }),
            /* @__PURE__ */ jsxs15(
              "button",
              {
                type: "button",
                onClick: () => onRefreshAiTools(plugin.id),
                disabled: aiToolsLoading || !state.enabled || !state.mcpEnabled,
                className: "inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 disabled:opacity-40 transition-colors",
                children: [
                  aiToolsLoading ? /* @__PURE__ */ jsx15(RefreshCw, { size: 11, className: "animate-spin" }) : /* @__PURE__ */ jsx15(RefreshCw, { size: 11 }),
                  t2("plugins.refreshAiTools", { defaultValue: "\u5237\u65B0" })
                ]
              }
            )
          ] }),
          aiToolsError ? /* @__PURE__ */ jsx15("span", { className: "text-[11px] text-danger", children: aiToolsError }) : aiTools.length > 0 ? /* @__PURE__ */ jsx15("div", { className: "space-y-2", children: aiTools.map((serverInfo) => /* @__PURE__ */ jsxs15("div", { children: [
            /* @__PURE__ */ jsxs15("div", { className: "flex items-center justify-between text-[11px]", children: [
              /* @__PURE__ */ jsx15("span", { className: "text-text-secondary", children: serverInfo.server }),
              /* @__PURE__ */ jsx15("span", { className: "text-text-muted", children: serverInfo.injected === "injected" ? t2("plugins.aiToolsInjected", { defaultValue: "\u5DF2\u6CE8\u5165" }) : t2("plugins.aiToolsLazy", { defaultValue: "\u4E0B\u4E00\u8F6E\u53EF\u89C1" }) })
            ] }),
            serverInfo.tools.length > 0 ? /* @__PURE__ */ jsx15("div", { className: "mt-1 space-y-1", children: serverInfo.tools.map((tool) => {
              const enabled = serverInfo.toolGates?.[tool] ?? true;
              return /* @__PURE__ */ jsxs15("div", { className: "flex items-center justify-between gap-1 pl-1", children: [
                /* @__PURE__ */ jsx15("span", { className: `min-w-0 flex-1 truncate font-mono text-[10px] ${enabled ? "text-text-secondary" : "text-text-muted line-through"}`, children: tool }),
                /* @__PURE__ */ jsx15(
                  "input",
                  {
                    type: "checkbox",
                    checked: enabled,
                    disabled: !state.enabled || !state.mcpEnabled || serverInfo.injected !== "injected",
                    onChange: (event) => onToggleAiTool(plugin.id, tool, event.target.checked),
                    className: "h-3 w-3 shrink-0 accent-primary"
                  }
                )
              ] }, tool);
            }) }) : /* @__PURE__ */ jsx15("span", { className: "text-[10px] text-text-muted", children: t2("plugins.aiToolsUnknown", { defaultValue: "\u5DE5\u5177\u6E05\u5355\u672A\u77E5\uFF08\u4E0B\u4E00\u8F6E\u6CE8\u5165\u540E\u53EF\u89C1\uFF09" }) })
          ] }, serverInfo.server)) }) : /* @__PURE__ */ jsx15("span", { className: "text-[11px] text-text-muted", children: t2("plugins.noAiTools", { defaultValue: "\u65E0 AI \u5DE5\u5177" }) })
        ] }),
        /* @__PURE__ */ jsxs15("div", { className: "rounded border border-border-subtle bg-background-elevated p-2.5", children: [
          /* @__PURE__ */ jsx15("div", { className: "mb-1.5", children: /* @__PURE__ */ jsx15("span", { className: "text-xs font-medium text-text-secondary", children: t2("plugins.engineSurface", { defaultValue: "AI \u5F15\u64CE" }) }) }),
          engines.length > 0 ? /* @__PURE__ */ jsx15("div", { className: "space-y-1", children: engines.map((engine) => /* @__PURE__ */ jsxs15("div", { className: "flex items-center gap-1 text-[11px]", children: [
            /* @__PURE__ */ jsx15("span", { className: "text-text-secondary", children: engine.name }),
            /* @__PURE__ */ jsxs15("span", { className: "font-mono text-text-muted", children: [
              "(",
              engine.id,
              ")"
            ] })
          ] }, engine.id)) }) : /* @__PURE__ */ jsx15("span", { className: "text-[11px] text-text-muted", children: t2("plugins.noEngines", { defaultValue: "None" }) })
        ] }),
        capabilities.length > 0 && /* @__PURE__ */ jsxs15("div", { className: "rounded border border-border-subtle bg-background-elevated p-2.5", children: [
          /* @__PURE__ */ jsx15("div", { className: "mb-1.5", children: /* @__PURE__ */ jsx15("span", { className: "text-xs font-medium text-text-secondary", children: t2("plugins.capabilitiesTitle", { defaultValue: "\u63D0\u4F9B\u7684 Cap \u80FD\u529B" }) }) }),
          /* @__PURE__ */ jsx15("div", { className: "space-y-1", children: capabilities.map((cap) => /* @__PURE__ */ jsxs15("div", { className: "rounded bg-background-surface/60 px-2 py-1.5", children: [
            /* @__PURE__ */ jsxs15("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx15("code", { className: "text-[11px] text-text-primary", children: cap.id }),
              cap.replaces && /* @__PURE__ */ jsxs15("span", { className: "rounded bg-warning-faint px-1 text-[10px] text-warning", children: [
                t2("plugins.capOverride", { defaultValue: "\u8986\u76D6" }),
                " ",
                cap.replaceMode ?? "override"
              ] })
            ] }),
            /* @__PURE__ */ jsx15("div", { className: "text-[11px] text-text-secondary", children: cap.summary })
          ] }, cap.id)) })
        ] }),
        /* @__PURE__ */ jsxs15("div", { className: "rounded border border-border-subtle bg-background-elevated p-2.5", children: [
          /* @__PURE__ */ jsx15("div", { className: "mb-1.5", children: /* @__PURE__ */ jsx15("span", { className: "text-xs font-medium text-text-secondary", children: t2("plugins.permissionsTitle", { defaultValue: "Permissions" }) }) }),
          permissionEntries.length > 0 ? /* @__PURE__ */ jsx15("div", { className: "text-[11px] text-text-tertiary", children: permissionEntries.map(([key], i) => /* @__PURE__ */ jsxs15("span", { children: [
            i > 0 && /* @__PURE__ */ jsx15("span", { className: "text-text-muted", children: ", " }),
            formatPermissionLabel(key, t2)
          ] }, key)) }) : /* @__PURE__ */ jsx15("span", { className: "text-[11px] text-text-muted", children: t2("plugins.noPermissions") })
        ] }),
        /* @__PURE__ */ jsx15(PluginConfigForm, { manifest: plugin })
      ] }),
      /* @__PURE__ */ jsxs15("div", { className: "flex flex-wrap items-center gap-1.5", children: [
        /* @__PURE__ */ jsx15(
          "button",
          {
            type: "button",
            onClick: () => onReset(plugin.id),
            disabled: pluginStates[plugin.id] === void 0,
            className: "rounded border border-border-subtle px-2 py-1 text-[11px] text-text-secondary hover:bg-background-hover disabled:cursor-not-allowed disabled:opacity-50",
            children: t2("plugins.reset")
          }
        ),
        !plugin.builtin && !plugin.dev && /* @__PURE__ */ jsxs15(Fragment2, { children: [
          /* @__PURE__ */ jsxs15(
            "button",
            {
              type: "button",
              onClick: () => onCheckUpdate(plugin.id, plugin.installPath),
              disabled: updateLoadingId === plugin.id || !plugin.installPath,
              className: "inline-flex items-center gap-1 rounded border border-border-subtle px-2 py-1 text-[11px] text-text-secondary hover:bg-background-hover disabled:cursor-not-allowed disabled:opacity-50",
              children: [
                /* @__PURE__ */ jsx15(RefreshCw, { size: 10, className: updateLoadingId === plugin.id ? "animate-spin" : "" }),
                updateLoadingId === plugin.id ? t2("plugins.checkingUpdate", { defaultValue: "Checking..." }) : t2("plugins.checkUpdate", { defaultValue: "Update" })
              ]
            }
          ),
          /* @__PURE__ */ jsxs15(
            "button",
            {
              type: "button",
              onClick: () => onUninstall(plugin.id, plugin.installPath),
              disabled: operationLoading || !plugin.installPath,
              className: "inline-flex items-center gap-1 rounded border border-danger/30 px-2 py-1 text-[11px] text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50",
              children: [
                /* @__PURE__ */ jsx15(Trash2, { size: 10 }),
                t2("plugins.uninstall", { defaultValue: "Uninstall" })
              ]
            }
          ),
          /* @__PURE__ */ jsxs15(
            "button",
            {
              type: "button",
              onClick: () => onForceUninstall(plugin.id, plugin.installPath),
              disabled: operationLoading || !plugin.installPath,
              className: "inline-flex items-center gap-1 rounded border border-warning/30 px-2 py-1 text-[11px] text-warning hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-50",
              children: [
                /* @__PURE__ */ jsx15(TriangleAlert, { size: 10 }),
                t2("plugins.forceUninstall", { defaultValue: "Force" })
              ]
            }
          )
        ] }),
        !plugin.builtin && plugin.dev && /* @__PURE__ */ jsxs15(
          "button",
          {
            type: "button",
            onClick: () => onUninstall(plugin.id, plugin.installPath),
            disabled: operationLoading || !plugin.installPath,
            className: "inline-flex items-center gap-1 rounded border border-danger/30 px-2 py-1 text-[11px] text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50",
            children: [
              /* @__PURE__ */ jsx15(Trash2, { size: 10 }),
              t2("plugins.uninstallDev", { defaultValue: "\u79FB\u9664\uFF08\u4FDD\u7559\u6E90\u7801\uFF09" })
            ]
          }
        )
      ] }),
      updateCheck && /* @__PURE__ */ jsxs15("div", { className: "flex items-center justify-between gap-2 rounded border border-border-subtle bg-background-elevated px-2.5 py-1.5 text-[11px] text-text-tertiary", children: [
        /* @__PURE__ */ jsx15("div", { className: "min-w-0 truncate", children: updateCheck.skipped === "dev-link" ? t2("plugins.devSkipUpdate", { defaultValue: "\u6E90\u7801\u76F4\u8FDE\uFF08dev-link\uFF09\uFF0C\u65E0\u9700\u68C0\u67E5\u66F4\u65B0" }) : updateCheck.checked ? updateCheck.updateAvailable ? t2("plugins.updateAvailable", {
          defaultValue: "Update: {{current}} \u2192 {{latest}}",
          current: updateCheck.currentVersion,
          latest: updateCheck.latestVersion ?? "?"
        }) : t2("plugins.noUpdateAvailable", {
          defaultValue: "Up to date ({{version}})",
          version: updateCheck.currentVersion
        }) : updateCheck.error ?? t2("plugins.updateUnavailable", { defaultValue: "Update check failed" }) }),
        updateCheck.updateAvailable && /* @__PURE__ */ jsxs15(
          "button",
          {
            type: "button",
            onClick: () => onApplyUpdate(plugin.id, plugin.installPath),
            disabled: updateApplyLoadingId === plugin.id || !plugin.installPath || !updateCheck.downloadUrl,
            className: "shrink-0 inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50",
            children: [
              /* @__PURE__ */ jsx15(RefreshCw, { size: 10, className: updateApplyLoadingId === plugin.id ? "animate-spin" : "" }),
              updateApplyLoadingId === plugin.id ? t2("plugins.applyingUpdate", { defaultValue: "Updating..." }) : t2("plugins.applyUpdate", { defaultValue: "Apply" })
            ]
          }
        )
      ] })
    ] })
  ] });
}

// src/tabs/PerformanceTab.tsx
import { useCallback as useCallback5 } from "react";

// src/tabs/PerfMigrationBanner.tsx
import { useState as useState11 } from "react";
import { jsx as jsx16, jsxs as jsxs16 } from "react/jsx-runtime";
function PerfMigrationBanner({ onDismiss, onGoSettings }) {
  const { t: t2 } = useTranslation("settings");
  const [dismissing, setDismissing] = useState11(false);
  const handleDismiss = () => {
    setDismissing(true);
    onDismiss();
  };
  return /* @__PURE__ */ jsx16(
    "div",
    {
      role: "region",
      "aria-label": t2("performance.migrationBanner.title", "\u6027\u80FD\u4F18\u5316\u66F4\u65B0"),
      className: "p-4 rounded-lg bg-primary/5 border border-primary/30 mb-4",
      children: /* @__PURE__ */ jsxs16("div", { className: "flex items-start gap-3", children: [
        /* @__PURE__ */ jsx16(
          "svg",
          {
            className: "w-5 h-5 text-primary shrink-0 mt-0.5",
            fill: "none",
            viewBox: "0 0 24 24",
            stroke: "currentColor",
            children: /* @__PURE__ */ jsx16(
              "path",
              {
                strokeLinecap: "round",
                strokeLinejoin: "round",
                strokeWidth: 2,
                d: "M13 10V3L4 14h7v7l9-11h-7z"
              }
            )
          }
        ),
        /* @__PURE__ */ jsxs16("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsx16("p", { className: "text-sm font-medium text-text-primary", children: t2("performance.migrationBanner.title", "\u6027\u80FD\u4F18\u5316\u66F4\u65B0") }),
          /* @__PURE__ */ jsx16("p", { className: "text-xs text-text-muted mt-1", children: t2(
            "performance.migrationBanner.body",
            "\u4E3A\u83B7\u5F97\u6700\u4F73\u6027\u80FD\uFF0C\u8D44\u6E90\u5BC6\u96C6\u578B\u529F\u80FD\uFF08\u6587\u4EF6\u76D1\u542C\u3001\u56FE\u8868\u6E32\u67D3\u7B49\uFF09\u5DF2\u9ED8\u8BA4\u5173\u95ED\u3002\u6309\u9700\u5F00\u542F\u5BF9\u5E94\u5F00\u5173\u5373\u53EF\u6062\u590D\u529F\u80FD\uFF0C\u914D\u7F6E\u5373\u65F6\u751F\u6548\u65E0\u9700\u91CD\u542F\u3002"
          ) }),
          /* @__PURE__ */ jsxs16("div", { className: "flex items-center gap-2 mt-3", children: [
            onGoSettings && /* @__PURE__ */ jsx16(
              "button",
              {
                onClick: onGoSettings,
                className: "px-3 py-1.5 text-xs bg-primary text-white rounded-md hover:bg-primary/90 transition-colors",
                children: t2("performance.migrationBanner.goSettings", "\u67E5\u770B\u5F00\u5173")
              }
            ),
            /* @__PURE__ */ jsx16(
              "button",
              {
                onClick: handleDismiss,
                disabled: dismissing,
                className: "px-3 py-1.5 text-xs text-text-secondary bg-background-hover rounded-md hover:bg-background-base transition-colors disabled:opacity-50",
                children: t2("performance.migrationBanner.dismiss", "\u77E5\u9053\u4E86")
              }
            )
          ] })
        ] })
      ] })
    }
  );
}

// src/tabs/PerformanceTab.tsx
import { jsx as jsx17, jsxs as jsxs17 } from "react/jsx-runtime";
var FEATURES = [
  {
    key: "fileWatcher",
    title: "\u6587\u4EF6\u81EA\u52A8\u76D1\u542C",
    description: "\u76D1\u542C\u5DE5\u4F5C\u533A\u6587\u4EF6\u53D8\u5316\uFF0C\u81EA\u52A8\u5237\u65B0\u6587\u4EF6\u6811\u548C\u7F16\u8F91\u5668",
    resource: "CPU",
    fallback: "\u5173\u95ED\u540E\u9700\u624B\u52A8\u5237\u65B0\u6587\u4EF6\u6811\uFF08\u70B9\u51FB\u5237\u65B0\u6309\u94AE\u6216\u91CD\u65B0\u6253\u5F00\u76EE\u5F55\uFF09"
  },
  {
    key: "syntaxHighlighting",
    title: "\u8BED\u6CD5\u9AD8\u4EAE",
    description: "\u4EE3\u7801\u5757\u4F7F\u7528 highlight.js \u7740\u8272\uFF0C\u652F\u6301 12+ \u79CD\u7F16\u7A0B\u8BED\u8A00",
    resource: "Memory",
    fallback: "\u5173\u95ED\u540E\u4EE3\u7801\u5757\u4EE5\u7B49\u5BBD\u5B57\u4F53\u539F\u6837\u5C55\u793A\uFF0C\u65E0\u989C\u8272\u7740\u8272"
  },
  {
    key: "mermaidDiagrams",
    title: "Mermaid \u56FE\u8868\u6E32\u67D3",
    description: "\u81EA\u52A8\u5C06 mermaid \u4EE3\u7801\u5757\u6E32\u67D3\u4E3A\u6D41\u7A0B\u56FE\u3001\u5E8F\u5217\u56FE\u7B49\u56FE\u8868",
    resource: "Memory",
    fallback: "\u5173\u95ED\u540E mermaid \u4EE3\u7801\u5757\u4EE5\u666E\u901A\u4EE3\u7801\u6837\u5F0F\u5C55\u793A\uFF0C\u53EF\u5728\u4EE3\u7801\u5757\u4E0A\u624B\u52A8\u70B9\u51FB\u6E32\u67D3"
  },
  {
    key: "katexMath",
    title: "KaTeX \u6570\u5B66\u516C\u5F0F",
    description: "\u81EA\u52A8\u6E32\u67D3 LaTeX \u6570\u5B66\u516C\u5F0F\uFF08\u884C\u5185 $...$ \u548C\u5757\u7EA7 $$...$$\uFF09",
    resource: "Memory",
    fallback: "\u5173\u95ED\u540E LaTeX \u8BED\u6CD5\u4EE5\u539F\u59CB\u6587\u672C\u5C55\u793A"
  },
  {
    key: "codeEditorLanguages",
    title: "\u7F16\u8F91\u5668\u8BED\u8A00\u5305\u9884\u52A0\u8F7D",
    description: "\u542F\u52A8\u65F6\u9884\u52A0\u8F7D\u5168\u90E8\u7F16\u7A0B\u8BED\u8A00\u7684\u9AD8\u4EAE\u548C\u81EA\u52A8\u8865\u5168\u652F\u6301",
    resource: "Memory",
    fallback: "\u5173\u95ED\u540E\u6309\u9700\u52A0\u8F7D\uFF08\u6253\u5F00\u6587\u4EF6\u65F6\u6309\u6269\u5C55\u540D\u52A8\u6001\u52A0\u8F7D\u5BF9\u5E94\u8BED\u8A00\u5305\uFF09"
  },
  {
    key: "pluginAutoStart",
    title: "\u63D2\u4EF6\u670D\u52A1\u81EA\u52A8\u542F\u52A8",
    description: "\u5E94\u7528\u542F\u52A8\u65F6\u81EA\u52A8\u62C9\u8D77\u6240\u6709\u5DF2\u542F\u7528\u63D2\u4EF6\u7684\u540E\u53F0\u670D\u52A1\u8FDB\u7A0B",
    resource: "Process",
    fallback: "\u5173\u95ED\u540E\u9996\u6B21\u4F7F\u7528\u63D2\u4EF6\u529F\u80FD\u65F6\u624D\u6309\u9700\u542F\u52A8\u670D\u52A1"
  }
];
function PerformanceTab({ config, onConfigChange, loading }) {
  const { t: t2 } = useTranslation("settings");
  const localPerf = config.performance ?? {};
  const toggleFeature = useCallback5((key) => {
    const newVal = !localPerf[key];
    onConfigChange({
      ...config,
      performance: {
        ...config.performance ?? {},
        [key]: newVal
      }
    });
  }, [config, localPerf, onConfigChange]);
  const activeCount = Object.values(localPerf).filter(Boolean).length;
  const totalCount = FEATURES.length;
  const allOff = activeCount === 0;
  const migrationDismissed = config.perfMigrationDismissed === true;
  const showMigrationBanner = allOff && !migrationDismissed;
  const dismissMigration = useCallback5(() => {
    onConfigChange({
      ...config,
      perfMigrationDismissed: true
    });
  }, [config, onConfigChange]);
  return /* @__PURE__ */ jsxs17("div", { className: "space-y-4", children: [
    showMigrationBanner && /* @__PURE__ */ jsx17(PerfMigrationBanner, { onDismiss: dismissMigration }),
    /* @__PURE__ */ jsxs17("div", { className: "p-4 rounded-lg bg-surface border border-border-subtle", children: [
      /* @__PURE__ */ jsxs17("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsx17("span", { className: "text-sm font-medium text-text-primary", children: t2("performance.overview", "\u5F53\u524D\u5DF2\u5F00\u542F {{active}}/{{total}} \u4E2A\u529F\u80FD", {
          active: activeCount,
          total: totalCount
        }) }),
        /* @__PURE__ */ jsx17("span", { className: "text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium", children: activeCount === 0 ? t2("performance.allOff", "\u5168\u90E8\u5173\u95ED \xB7 \u6700\u8F7B\u91CF") : `${activeCount} \u4E2A\u8FD0\u884C\u4E2D` })
      ] }),
      /* @__PURE__ */ jsx17("p", { className: "text-xs text-text-muted", children: t2("performance.tips", "\u9ED8\u8BA4\u5168\u90E8\u5173\u95ED\u4EE5\u8282\u7701\u8D44\u6E90\uFF0C\u6309\u9700\u5F00\u542F\u3002\u914D\u7F6E\u53D8\u66F4\u5373\u65F6\u751F\u6548\uFF0C\u65E0\u9700\u91CD\u542F\u5E94\u7528\u3002") })
    ] }),
    /* @__PURE__ */ jsx17("div", { className: "space-y-2", children: FEATURES.map((feature) => {
      const enabled = localPerf[feature.key] ?? false;
      return /* @__PURE__ */ jsx17(
        "div",
        {
          className: `p-3 rounded-lg border transition-colors ${enabled ? "bg-primary/5 border-primary/30" : "bg-background-base border-border-subtle"}`,
          children: /* @__PURE__ */ jsxs17("div", { className: "flex items-start justify-between gap-3", children: [
            /* @__PURE__ */ jsxs17("div", { className: "flex-1 min-w-0", children: [
              /* @__PURE__ */ jsxs17("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx17("span", { className: "text-sm font-medium text-text-primary", children: feature.title }),
                /* @__PURE__ */ jsx17("span", { className: "text-xs px-1.5 py-0.5 rounded bg-text-tertiary/10 text-text-tertiary font-mono", children: feature.resource })
              ] }),
              /* @__PURE__ */ jsx17("p", { className: "text-xs text-text-muted mt-1", children: feature.description }),
              /* @__PURE__ */ jsx17("p", { className: "text-xs text-text-tertiary mt-0.5 opacity-70", children: feature.fallback })
            ] }),
            /* @__PURE__ */ jsx17(
              "button",
              {
                role: "switch",
                "aria-checked": enabled,
                "aria-label": enabled ? t2("performance.switchOff", "\u5173\u95ED {{name}}", { name: feature.title }) : t2("performance.switchOn", "\u5F00\u542F {{name}}", { name: feature.title }),
                title: enabled ? "\u5173\u95ED" : "\u5F00\u542F",
                onClick: () => toggleFeature(feature.key),
                disabled: loading,
                className: `
                    relative inline-flex items-center h-6 w-11 rounded-full
                    transition-colors
                    focus:outline-none
                    focus-visible:ring-2 focus-visible:ring-primary
                    focus-visible:ring-offset-2
                    ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                    ${enabled ? "bg-primary" : "bg-border"}
                  `,
                children: /* @__PURE__ */ jsx17(
                  "span",
                  {
                    className: `
                      inline-block h-4 w-4 transform rounded-full bg-white
                      shadow-sm
                      transition-transform
                      ${enabled ? "translate-x-6" : "translate-x-1"}
                    `
                  }
                )
              }
            )
          ] })
        },
        feature.key
      );
    }) }),
    /* @__PURE__ */ jsxs17("div", { className: "mt-4 p-3 rounded-lg bg-warning-faint/50 border border-warning/20 text-xs text-text-muted", children: [
      /* @__PURE__ */ jsx17("p", { className: "font-medium text-warning mb-1", children: t2("performance.notes", "\u6CE8\u610F\u4E8B\u9879") }),
      /* @__PURE__ */ jsxs17("ul", { className: "space-y-1 list-disc list-inside text-xs", children: [
        /* @__PURE__ */ jsx17("li", { children: t2("performance.note2", "\u63D2\u4EF6\u670D\u52A1\u81EA\u52A8\u542F\u52A8\u5173\u95ED\u540E\uFF0C\u9996\u6B21\u4F7F\u7528\u63D2\u4EF6\u529F\u80FD\u65F6\u4F1A\u6709\u77ED\u6682\u7B49\u5F85\uFF082-3 \u79D2\uFF09") }),
        /* @__PURE__ */ jsx17("li", { children: t2("performance.note3", "\u5982\u679C\u4E0D\u786E\u5B9A\uFF0C\u4FDD\u6301\u9ED8\u8BA4\u5173\u95ED\u5373\u53EF\u83B7\u5F97\u6700\u4F73\u6027\u80FD") })
      ] })
    ] })
  ] });
}

// src/SettingsPage.tsx
import { jsx as jsx18, jsxs as jsxs18 } from "react/jsx-runtime";
var log4 = createLogger("SettingsPage");
var TAB_TITLE_KEYS = {
  "general": "nav.general",
  "theme": "nav.theme",
  "plugins": "nav.plugins",
  "ai-engine": "nav.aiEngine",
  "app-update": "nav.appUpdate",
  "advanced": "nav.advanced",
  "web": "nav.web",
  "performance": "nav.performance"
};
function SettingsPage({ onClose, initialTab }) {
  const { t: t2 } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const { config, loading, error, updateConfigPatch } = useConfigStore();
  const { success, error: toastError } = useToastStore();
  const [localConfig, setLocalConfig] = useState12(config);
  const baseConfigRef = useRef3(config);
  const [saving, setSaving] = useState12(false);
  const [activeTab, setActiveTab] = useState12(initialTab || "general");
  const [searchQuery, setSearchQuery] = useState12("");
  const [webStatusRefreshKey, setWebStatusRefreshKey] = useState12(0);
  const { ref: bodyRef, width: bodyWidth } = useContainerWidth(window.innerWidth);
  const wideLayout = bodyWidth >= 640;
  const initialLoadDone = useRef3(false);
  useEffect10(() => {
    if (config && !initialLoadDone.current) {
      setLocalConfig(config);
      baseConfigRef.current = config;
      initialLoadDone.current = true;
    }
  }, [config]);
  const topLevelKeysByTab = {
    general: ["language", "uiControlEnabled", "autoLaunch"],
    theme: ["theme"],
    advanced: ["gitBinPath", "sessionDir"],
    web: ["web"],
    "ai-engine": ["defaultEngine", "claudeCode"],
    performance: ["performance", "perfMigrationDismissed"]
  };
  const hasChanged = (a, b) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
  const buildPatch = (local, keys) => {
    const base = baseConfigRef.current;
    if (!base) return local;
    const targetKeys = keys ?? Object.keys(local);
    return targetKeys.reduce((patch, key) => {
      if (hasChanged(local[key], base[key])) {
        return { ...patch, [key]: local[key] === void 0 ? null : local[key] };
      }
      return patch;
    }, {});
  };
  const preserveUnsavedLocalChanges = (savedConfig, local, savedKeys) => {
    const base = baseConfigRef.current;
    if (!base) return savedConfig;
    const savedKeySet = new Set(savedKeys);
    return Object.keys(local).reduce((next, key) => {
      if (!savedKeySet.has(key) && hasChanged(local[key], base[key])) {
        return { ...next, [key]: local[key] };
      }
      return next;
    }, savedConfig);
  };
  const applyWebServerIfNeeded = async (shouldApply) => {
    if (!shouldApply || currentMode2 !== "tauri") return;
    await applyWebServer();
    setWebStatusRefreshKey((key) => key + 1);
  };
  const handleSaveCurrentTab = async () => {
    if (!localConfig) return;
    try {
      setSaving(true);
      const keys = topLevelKeysByTab[activeTab] ?? [];
      const patch = buildPatch(localConfig, keys);
      const savedConfig = Object.keys(patch).length > 0 ? await updateConfigPatch(patch) : await getConfig();
      await applyWebServerIfNeeded(activeTab === "web");
      if (savedConfig) {
        const nextLocal = preserveUnsavedLocalChanges(savedConfig, localConfig, keys);
        baseConfigRef.current = savedConfig;
        setLocalConfig(nextLocal);
      }
      success(t2("messages.saved"), t2("messages.configSavedDesc"));
    } catch (err) {
      log4.error("Failed to save config:", err instanceof Error ? err : new Error(String(err)));
      toastError(t2("messages.saveFailed"), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };
  const handleSaveAndClose = async () => {
    if (!localConfig) return;
    try {
      setSaving(true);
      const patch = buildPatch(localConfig);
      if (Object.keys(patch).length > 0) {
        await updateConfigPatch(patch);
      }
      await applyWebServerIfNeeded(Object.prototype.hasOwnProperty.call(patch, "web"));
      success(t2("messages.saved"), t2("messages.configSavedDesc"));
      onClose();
    } catch (err) {
      log4.error("\u4FDD\u5B58\u914D\u7F6E\u5931\u8D25", err instanceof Error ? err : new Error(String(err)));
      toastError(t2("messages.saveFailed"), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };
  if (!localConfig) {
    return /* @__PURE__ */ jsx18("div", { className: "flex-1 flex items-center justify-center", children: /* @__PURE__ */ jsx18("div", { className: "text-center text-text-muted", children: tCommon("status.loading") }) });
  }
  return /* @__PURE__ */ jsxs18("div", { "data-theme-panel": true, className: "flex-1 min-h-0 flex flex-col overflow-hidden bg-background-elevated", children: [
    /* @__PURE__ */ jsxs18("div", { className: "flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-border-subtle", children: [
      /* @__PURE__ */ jsx18("h2", { className: "text-lg font-semibold text-text-primary", children: t2("title") }),
      /* @__PURE__ */ jsxs18("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx18(
          Button,
          {
            variant: "ghost",
            onClick: onClose,
            disabled: saving,
            children: tCommon("actions.cancel")
          }
        ),
        /* @__PURE__ */ jsx18(
          Button,
          {
            variant: "primary",
            onClick: handleSaveAndClose,
            disabled: saving || loading,
            children: saving ? tCommon("status.saving") : tCommon("actions.saveAndClose")
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs18("div", { ref: bodyRef, className: `flex min-h-0 ${wideLayout ? "flex-row" : "flex-col"} flex-1 overflow-hidden`, children: [
      /* @__PURE__ */ jsx18(
        SettingsSidebar,
        {
          wide: wideLayout,
          activeTab,
          onTabChange: setActiveTab,
          searchQuery,
          onSearchChange: setSearchQuery
        }
      ),
      /* @__PURE__ */ jsxs18("div", { className: "min-h-0 flex-1 flex flex-col overflow-hidden", children: [
        error && /* @__PURE__ */ jsx18("div", { className: "mx-4 mt-4 p-3 bg-danger-faint border border-danger/30 rounded-lg text-danger text-sm", children: error }),
        /* @__PURE__ */ jsxs18("div", { className: "flex-1 overflow-y-auto p-3 sm:p-6", children: [
          /* @__PURE__ */ jsx18("h3", { className: "text-base font-medium text-text-primary mb-4", children: t2(TAB_TITLE_KEYS[activeTab]) }),
          activeTab === "plugins" && /* @__PURE__ */ jsx18(PluginTab, {}),
          activeTab === "ai-engine" && /* @__PURE__ */ jsx18(
            AIEngineTab,
            {
              config: localConfig,
              onConfigChange: setLocalConfig,
              loading
            }
          ),
          activeTab === "theme" && /* @__PURE__ */ jsx18(ThemeTab, {}),
          activeTab === "general" && /* @__PURE__ */ jsx18(
            GeneralTab,
            {
              config: localConfig,
              onConfigChange: setLocalConfig,
              loading
            }
          ),
          activeTab === "advanced" && /* @__PURE__ */ jsx18(
            AdvancedTab,
            {
              config: localConfig,
              onConfigChange: setLocalConfig,
              loading
            }
          ),
          activeTab === "app-update" && /* @__PURE__ */ jsx18(AppUpdateTab, {}),
          activeTab === "web" && /* @__PURE__ */ jsx18(
            WebTab,
            {
              config: localConfig,
              onConfigChange: setLocalConfig,
              loading,
              statusRefreshKey: webStatusRefreshKey
            }
          ),
          activeTab === "performance" && /* @__PURE__ */ jsx18(
            PerformanceTab,
            {
              config: localConfig,
              onConfigChange: setLocalConfig,
              loading
            }
          )
        ] }),
        /* @__PURE__ */ jsx18("div", { className: "px-3 sm:px-6 py-3 sm:py-4 border-t border-border-subtle", children: /* @__PURE__ */ jsxs18("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx18("span", { className: "text-xs text-text-tertiary", children: t2("currentGroup", "\u5F53\u524D\u5206\u7EC4\uFF1A{{name}}", { name: t2(TAB_TITLE_KEYS[activeTab]) }) }),
          /* @__PURE__ */ jsx18(
            Button,
            {
              variant: "secondary",
              onClick: handleSaveCurrentTab,
              disabled: saving || loading,
              children: saving ? tCommon("status.saving") : t2("saveTab", "\u4FDD\u5B58{{name}}", { name: t2(TAB_TITLE_KEYS[activeTab]) })
            }
          )
        ] }) })
      ] })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx19 } from "react/jsx-runtime";
function SettingsDeskEntry({ initialTab, onClose }) {
  const [key] = useState13(() => `settings-desk-${Date.now()}`);
  return /* @__PURE__ */ jsx19(
    SettingsPage,
    {
      initialTab,
      onClose: onClose ?? (() => {
      })
    },
    key
  );
}
export {
  SettingsDeskEntry as default
};
/*! Bundled license information:

react-is/cjs/react-is.development.js:
  (** @license React v16.13.1
   * react-is.development.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

object-assign/index.js:
  (*
  object-assign
  (c) Sindre Sorhus
  @license MIT
  *)

lucide-react/dist/esm/shared/src/utils.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/defaultAttributes.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/Icon.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/createLucideIcon.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/blocks.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/book-open.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/check.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/chevron-down.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/chevron-right.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/circle-check.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/copy.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/download.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/external-link.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/folder-open.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/globe.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/link-2.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/loader-circle.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/package-plus.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/package.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/palette.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/plug-zap.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/plug.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/puzzle.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/refresh-cw.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/smartphone.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/trash-2.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/triangle-alert.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/lucide-react.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
