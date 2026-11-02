var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
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

// node_modules/luxon/build/node/luxon.js
var require_luxon = __commonJS({
  "node_modules/luxon/build/node/luxon.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var LuxonError = class extends Error {
    };
    var InvalidDateTimeError = class extends LuxonError {
      constructor(reason) {
        super(`Invalid DateTime: ${reason.toMessage()}`);
      }
    };
    var InvalidIntervalError = class extends LuxonError {
      constructor(reason) {
        super(`Invalid Interval: ${reason.toMessage()}`);
      }
    };
    var InvalidDurationError = class extends LuxonError {
      constructor(reason) {
        super(`Invalid Duration: ${reason.toMessage()}`);
      }
    };
    var ConflictingSpecificationError = class extends LuxonError {
    };
    var InvalidUnitError = class extends LuxonError {
      constructor(unit) {
        super(`Invalid unit ${unit}`);
      }
    };
    var InvalidArgumentError = class extends LuxonError {
    };
    var ZoneIsAbstractError = class extends LuxonError {
      constructor() {
        super("Zone is an abstract class");
      }
    };
    var n = "numeric";
    var s = "short";
    var l = "long";
    var DATE_SHORT = {
      year: n,
      month: n,
      day: n
    };
    var DATE_MED = {
      year: n,
      month: s,
      day: n
    };
    var DATE_MED_WITH_WEEKDAY = {
      year: n,
      month: s,
      day: n,
      weekday: s
    };
    var DATE_FULL = {
      year: n,
      month: l,
      day: n
    };
    var DATE_HUGE = {
      year: n,
      month: l,
      day: n,
      weekday: l
    };
    var TIME_SIMPLE = {
      hour: n,
      minute: n
    };
    var TIME_WITH_SECONDS = {
      hour: n,
      minute: n,
      second: n
    };
    var TIME_WITH_SHORT_OFFSET = {
      hour: n,
      minute: n,
      second: n,
      timeZoneName: s
    };
    var TIME_WITH_LONG_OFFSET = {
      hour: n,
      minute: n,
      second: n,
      timeZoneName: l
    };
    var TIME_24_SIMPLE = {
      hour: n,
      minute: n,
      hourCycle: "h23"
    };
    var TIME_24_WITH_SECONDS = {
      hour: n,
      minute: n,
      second: n,
      hourCycle: "h23"
    };
    var TIME_24_WITH_SHORT_OFFSET = {
      hour: n,
      minute: n,
      second: n,
      hourCycle: "h23",
      timeZoneName: s
    };
    var TIME_24_WITH_LONG_OFFSET = {
      hour: n,
      minute: n,
      second: n,
      hourCycle: "h23",
      timeZoneName: l
    };
    var DATETIME_SHORT = {
      year: n,
      month: n,
      day: n,
      hour: n,
      minute: n
    };
    var DATETIME_SHORT_WITH_SECONDS = {
      year: n,
      month: n,
      day: n,
      hour: n,
      minute: n,
      second: n
    };
    var DATETIME_MED = {
      year: n,
      month: s,
      day: n,
      hour: n,
      minute: n
    };
    var DATETIME_MED_WITH_SECONDS = {
      year: n,
      month: s,
      day: n,
      hour: n,
      minute: n,
      second: n
    };
    var DATETIME_MED_WITH_WEEKDAY = {
      year: n,
      month: s,
      day: n,
      weekday: s,
      hour: n,
      minute: n
    };
    var DATETIME_FULL = {
      year: n,
      month: l,
      day: n,
      hour: n,
      minute: n,
      timeZoneName: s
    };
    var DATETIME_FULL_WITH_SECONDS = {
      year: n,
      month: l,
      day: n,
      hour: n,
      minute: n,
      second: n,
      timeZoneName: s
    };
    var DATETIME_HUGE = {
      year: n,
      month: l,
      day: n,
      weekday: l,
      hour: n,
      minute: n,
      timeZoneName: l
    };
    var DATETIME_HUGE_WITH_SECONDS = {
      year: n,
      month: l,
      day: n,
      weekday: l,
      hour: n,
      minute: n,
      second: n,
      timeZoneName: l
    };
    var Zone = class {
      /**
       * The type of zone
       * @abstract
       * @type {string}
       */
      get type() {
        throw new ZoneIsAbstractError();
      }
      /**
       * The name of this zone.
       * @abstract
       * @type {string}
       */
      get name() {
        throw new ZoneIsAbstractError();
      }
      /**
       * The IANA name of this zone.
       * Defaults to `name` if not overwritten by a subclass.
       * @abstract
       * @type {string}
       */
      get ianaName() {
        return this.name;
      }
      /**
       * Returns whether the offset is known to be fixed for the whole year.
       * @abstract
       * @type {boolean}
       */
      get isUniversal() {
        throw new ZoneIsAbstractError();
      }
      /**
       * Returns the offset's common name (such as EST) at the specified timestamp
       * @abstract
       * @param {number} ts - Epoch milliseconds for which to get the name
       * @param {Object} opts - Options to affect the format
       * @param {string} opts.format - What style of offset to return. Accepts 'long' or 'short'.
       * @param {string} opts.locale - What locale to return the offset name in.
       * @return {string}
       */
      offsetName(ts, opts) {
        throw new ZoneIsAbstractError();
      }
      /**
       * Returns the offset's value as a string
       * @abstract
       * @param {number} ts - Epoch milliseconds for which to get the offset
       * @param {string} format - What style of offset to return.
       *                          Accepts 'narrow', 'short', or 'techie'. Returning '+6', '+06:00', or '+0600' respectively
       * @return {string}
       */
      formatOffset(ts, format) {
        throw new ZoneIsAbstractError();
      }
      /**
       * Return the offset in minutes for this zone at the specified timestamp.
       * @abstract
       * @param {number} ts - Epoch milliseconds for which to compute the offset
       * @return {number}
       */
      offset(ts) {
        throw new ZoneIsAbstractError();
      }
      /**
       * Return whether this Zone is equal to another zone
       * @abstract
       * @param {Zone} otherZone - the zone to compare
       * @return {boolean}
       */
      equals(otherZone) {
        throw new ZoneIsAbstractError();
      }
      /**
       * Return whether this Zone is valid.
       * @abstract
       * @type {boolean}
       */
      get isValid() {
        throw new ZoneIsAbstractError();
      }
    };
    var singleton$1 = null;
    var SystemZone = class _SystemZone extends Zone {
      /**
       * Get a singleton instance of the local zone
       * @return {SystemZone}
       */
      static get instance() {
        if (singleton$1 === null) {
          singleton$1 = new _SystemZone();
        }
        return singleton$1;
      }
      /** @override **/
      get type() {
        return "system";
      }
      /** @override **/
      get name() {
        return new Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
      /** @override **/
      get isUniversal() {
        return false;
      }
      /** @override **/
      offsetName(ts, {
        format,
        locale
      }) {
        return parseZoneInfo(ts, format, locale);
      }
      /** @override **/
      formatOffset(ts, format) {
        return formatOffset(this.offset(ts), format);
      }
      /** @override **/
      offset(ts) {
        return -new Date(ts).getTimezoneOffset();
      }
      /** @override **/
      equals(otherZone) {
        return otherZone.type === "system";
      }
      /** @override **/
      get isValid() {
        return true;
      }
    };
    var dtfCache = /* @__PURE__ */ new Map();
    function makeDTF(zoneName) {
      let dtf = dtfCache.get(zoneName);
      if (dtf === void 0) {
        dtf = new Intl.DateTimeFormat("en-US", {
          hour12: false,
          timeZone: zoneName,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          era: "short"
        });
        dtfCache.set(zoneName, dtf);
      }
      return dtf;
    }
    var typeToPos = {
      year: 0,
      month: 1,
      day: 2,
      era: 3,
      hour: 4,
      minute: 5,
      second: 6
    };
    function hackyOffset(dtf, date) {
      const formatted = dtf.format(date).replace(/\u200E/g, ""), parsed = /(\d+)\/(\d+)\/(\d+) (AD|BC),? (\d+):(\d+):(\d+)/.exec(formatted), [, fMonth, fDay, fYear, fadOrBc, fHour, fMinute, fSecond] = parsed;
      return [fYear, fMonth, fDay, fadOrBc, fHour, fMinute, fSecond];
    }
    function partsOffset(dtf, date) {
      const formatted = dtf.formatToParts(date);
      const filled = [];
      for (let i = 0; i < formatted.length; i++) {
        const {
          type: type2,
          value
        } = formatted[i];
        const pos = typeToPos[type2];
        if (type2 === "era") {
          filled[pos] = value;
        } else if (!isUndefined(pos)) {
          filled[pos] = parseInt(value, 10);
        }
      }
      return filled;
    }
    var ianaZoneCache = /* @__PURE__ */ new Map();
    var IANAZone = class _IANAZone extends Zone {
      /**
       * @param {string} name - Zone name
       * @return {IANAZone}
       */
      static create(name) {
        let zone = ianaZoneCache.get(name);
        if (zone === void 0) {
          ianaZoneCache.set(name, zone = new _IANAZone(name));
        }
        return zone;
      }
      /**
       * Reset local caches. Should only be necessary in testing scenarios.
       * @return {void}
       */
      static resetCache() {
        ianaZoneCache.clear();
        dtfCache.clear();
      }
      /**
       * Returns whether the provided string is a valid specifier. This only checks the string's format, not that the specifier identifies a known zone; see isValidZone for that.
       * @param {string} s - The string to check validity on
       * @example IANAZone.isValidSpecifier("America/New_York") //=> true
       * @example IANAZone.isValidSpecifier("Sport~~blorp") //=> false
       * @deprecated For backward compatibility, this forwards to isValidZone, better use `isValidZone()` directly instead.
       * @return {boolean}
       */
      static isValidSpecifier(s2) {
        return this.isValidZone(s2);
      }
      /**
       * Returns whether the provided string identifies a real zone
       * @param {string} zone - The string to check
       * @example IANAZone.isValidZone("America/New_York") //=> true
       * @example IANAZone.isValidZone("Fantasia/Castle") //=> false
       * @example IANAZone.isValidZone("Sport~~blorp") //=> false
       * @return {boolean}
       */
      static isValidZone(zone) {
        if (!zone) {
          return false;
        }
        try {
          new Intl.DateTimeFormat("en-US", {
            timeZone: zone
          }).format();
          return true;
        } catch (e) {
          return false;
        }
      }
      constructor(name) {
        super();
        this.zoneName = name;
        this.valid = _IANAZone.isValidZone(name);
      }
      /**
       * The type of zone. `iana` for all instances of `IANAZone`.
       * @override
       * @type {string}
       */
      get type() {
        return "iana";
      }
      /**
       * The name of this zone (i.e. the IANA zone name).
       * @override
       * @type {string}
       */
      get name() {
        return this.zoneName;
      }
      /**
       * Returns whether the offset is known to be fixed for the whole year:
       * Always returns false for all IANA zones.
       * @override
       * @type {boolean}
       */
      get isUniversal() {
        return false;
      }
      /**
       * Returns the offset's common name (such as EST) at the specified timestamp
       * @override
       * @param {number} ts - Epoch milliseconds for which to get the name
       * @param {Object} opts - Options to affect the format
       * @param {string} opts.format - What style of offset to return. Accepts 'long' or 'short'.
       * @param {string} opts.locale - What locale to return the offset name in.
       * @return {string}
       */
      offsetName(ts, {
        format,
        locale
      }) {
        return parseZoneInfo(ts, format, locale, this.name);
      }
      /**
       * Returns the offset's value as a string
       * @override
       * @param {number} ts - Epoch milliseconds for which to get the offset
       * @param {string} format - What style of offset to return.
       *                          Accepts 'narrow', 'short', or 'techie'. Returning '+6', '+06:00', or '+0600' respectively
       * @return {string}
       */
      formatOffset(ts, format) {
        return formatOffset(this.offset(ts), format);
      }
      /**
       * Return the offset in minutes for this zone at the specified timestamp.
       * @override
       * @param {number} ts - Epoch milliseconds for which to compute the offset
       * @return {number}
       */
      offset(ts) {
        if (!this.valid) return NaN;
        const date = new Date(ts);
        if (isNaN(date)) return NaN;
        const dtf = makeDTF(this.name);
        let [year, month, day, adOrBc, hour, minute, second] = dtf.formatToParts ? partsOffset(dtf, date) : hackyOffset(dtf, date);
        if (adOrBc === "BC") {
          year = -Math.abs(year) + 1;
        }
        const adjustedHour = hour === 24 ? 0 : hour;
        const asUTC = objToLocalTS({
          year,
          month,
          day,
          hour: adjustedHour,
          minute,
          second,
          millisecond: 0
        });
        let asTS = +date;
        const over = asTS % 1e3;
        asTS -= over >= 0 ? over : 1e3 + over;
        return (asUTC - asTS) / (60 * 1e3);
      }
      /**
       * Return whether this Zone is equal to another zone
       * @override
       * @param {Zone} otherZone - the zone to compare
       * @return {boolean}
       */
      equals(otherZone) {
        return otherZone.type === "iana" && otherZone.name === this.name;
      }
      /**
       * Return whether this Zone is valid.
       * @override
       * @type {boolean}
       */
      get isValid() {
        return this.valid;
      }
    };
    var intlLFCache = {};
    function getCachedLF(locString, opts = {}) {
      const key = JSON.stringify([locString, opts]);
      let dtf = intlLFCache[key];
      if (!dtf) {
        dtf = new Intl.ListFormat(locString, opts);
        intlLFCache[key] = dtf;
      }
      return dtf;
    }
    var intlDTCache = /* @__PURE__ */ new Map();
    function getCachedDTF(locString, opts = {}) {
      const key = JSON.stringify([locString, opts]);
      let dtf = intlDTCache.get(key);
      if (dtf === void 0) {
        dtf = new Intl.DateTimeFormat(locString, opts);
        intlDTCache.set(key, dtf);
      }
      return dtf;
    }
    var intlNumCache = /* @__PURE__ */ new Map();
    function getCachedINF(locString, opts = {}) {
      const key = JSON.stringify([locString, opts]);
      let inf = intlNumCache.get(key);
      if (inf === void 0) {
        inf = new Intl.NumberFormat(locString, opts);
        intlNumCache.set(key, inf);
      }
      return inf;
    }
    var intlRelCache = /* @__PURE__ */ new Map();
    function getCachedRTF(locString, opts = {}) {
      const {
        base,
        ...cacheKeyOpts
      } = opts;
      const key = JSON.stringify([locString, cacheKeyOpts]);
      let inf = intlRelCache.get(key);
      if (inf === void 0) {
        inf = new Intl.RelativeTimeFormat(locString, opts);
        intlRelCache.set(key, inf);
      }
      return inf;
    }
    var sysLocaleCache = null;
    function systemLocale() {
      if (sysLocaleCache) {
        return sysLocaleCache;
      } else {
        sysLocaleCache = new Intl.DateTimeFormat().resolvedOptions().locale;
        return sysLocaleCache;
      }
    }
    var intlResolvedOptionsCache = /* @__PURE__ */ new Map();
    function getCachedIntResolvedOptions(locString) {
      let opts = intlResolvedOptionsCache.get(locString);
      if (opts === void 0) {
        opts = new Intl.DateTimeFormat(locString).resolvedOptions();
        intlResolvedOptionsCache.set(locString, opts);
      }
      return opts;
    }
    var weekInfoCache = /* @__PURE__ */ new Map();
    function getCachedWeekInfo(locString) {
      let data = weekInfoCache.get(locString);
      if (!data) {
        const locale = new Intl.Locale(locString);
        data = "getWeekInfo" in locale ? locale.getWeekInfo() : locale.weekInfo;
        if (!("minimalDays" in data)) {
          data = {
            ...fallbackWeekSettings,
            ...data
          };
        }
        weekInfoCache.set(locString, data);
      }
      return data;
    }
    function parseLocaleString(localeStr) {
      const xIndex = localeStr.indexOf("-x-");
      if (xIndex !== -1) {
        localeStr = localeStr.substring(0, xIndex);
      }
      const uIndex = localeStr.indexOf("-u-");
      if (uIndex === -1) {
        return [localeStr];
      } else {
        let options;
        let selectedStr;
        try {
          options = getCachedDTF(localeStr).resolvedOptions();
          selectedStr = localeStr;
        } catch (e) {
          const smaller = localeStr.substring(0, uIndex);
          options = getCachedDTF(smaller).resolvedOptions();
          selectedStr = smaller;
        }
        const {
          numberingSystem,
          calendar
        } = options;
        return [selectedStr, numberingSystem, calendar];
      }
    }
    function intlConfigString(localeStr, numberingSystem, outputCalendar) {
      if (outputCalendar || numberingSystem) {
        if (!localeStr.includes("-u-")) {
          localeStr += "-u";
        }
        if (outputCalendar) {
          localeStr += `-ca-${outputCalendar}`;
        }
        if (numberingSystem) {
          localeStr += `-nu-${numberingSystem}`;
        }
        return localeStr;
      } else {
        return localeStr;
      }
    }
    function mapMonths(f) {
      const ms = [];
      for (let i = 1; i <= 12; i++) {
        const dt = DateTime.utc(2009, i, 1);
        ms.push(f(dt));
      }
      return ms;
    }
    function mapWeekdays(f) {
      const ms = [];
      for (let i = 1; i <= 7; i++) {
        const dt = DateTime.utc(2016, 11, 13 + i);
        ms.push(f(dt));
      }
      return ms;
    }
    function listStuff(loc, length, englishFn, intlFn) {
      const mode = loc.listingMode();
      if (mode === "error") {
        return null;
      } else if (mode === "en") {
        return englishFn(length);
      } else {
        return intlFn(length);
      }
    }
    function supportsFastNumbers(loc) {
      if (loc.numberingSystem && loc.numberingSystem !== "latn") {
        return false;
      } else {
        return loc.numberingSystem === "latn" || !loc.locale || loc.locale.startsWith("en") || getCachedIntResolvedOptions(loc.locale).numberingSystem === "latn";
      }
    }
    var PolyNumberFormatter = class {
      constructor(intl, forceSimple, opts) {
        this.padTo = opts.padTo || 0;
        this.floor = opts.floor || false;
        const {
          padTo,
          floor,
          ...otherOpts
        } = opts;
        if (!forceSimple || Object.keys(otherOpts).length > 0) {
          const intlOpts = {
            useGrouping: false,
            ...opts
          };
          if (opts.padTo > 0) intlOpts.minimumIntegerDigits = opts.padTo;
          this.inf = getCachedINF(intl, intlOpts);
        }
      }
      format(i) {
        if (this.inf) {
          const fixed = this.floor ? Math.floor(i) : i;
          return this.inf.format(fixed);
        } else {
          const fixed = this.floor ? Math.floor(i) : roundTo(i, 3);
          return padStart(fixed, this.padTo);
        }
      }
    };
    var PolyDateFormatter = class {
      constructor(dt, intl, opts) {
        this.opts = opts;
        this.originalZone = void 0;
        let z = void 0;
        if (this.opts.timeZone) {
          this.dt = dt;
        } else if (dt.zone.type === "fixed") {
          const gmtOffset = -1 * (dt.offset / 60);
          const offsetZ = gmtOffset >= 0 ? `Etc/GMT+${gmtOffset}` : `Etc/GMT${gmtOffset}`;
          if (dt.offset !== 0 && IANAZone.create(offsetZ).valid) {
            z = offsetZ;
            this.dt = dt;
          } else {
            z = "UTC";
            this.dt = dt.offset === 0 ? dt : dt.setZone("UTC").plus({
              minutes: dt.offset
            });
            this.originalZone = dt.zone;
          }
        } else if (dt.zone.type === "system") {
          this.dt = dt;
        } else if (dt.zone.type === "iana") {
          this.dt = dt;
          z = dt.zone.name;
        } else {
          z = "UTC";
          this.dt = dt.setZone("UTC").plus({
            minutes: dt.offset
          });
          this.originalZone = dt.zone;
        }
        const intlOpts = {
          ...this.opts
        };
        intlOpts.timeZone = intlOpts.timeZone || z;
        this.dtf = getCachedDTF(intl, intlOpts);
      }
      format() {
        if (this.originalZone) {
          return this.formatToParts().map(({
            value
          }) => value).join("");
        }
        return this.dtf.format(this.dt.toJSDate());
      }
      formatToParts() {
        const parts = this.dtf.formatToParts(this.dt.toJSDate());
        if (this.originalZone) {
          return parts.map((part) => {
            if (part.type === "timeZoneName") {
              const offsetName = this.originalZone.offsetName(this.dt.ts, {
                locale: this.dt.locale,
                format: this.opts.timeZoneName
              });
              return {
                ...part,
                value: offsetName
              };
            } else {
              return part;
            }
          });
        }
        return parts;
      }
      resolvedOptions() {
        return this.dtf.resolvedOptions();
      }
    };
    var PolyRelFormatter = class {
      constructor(intl, isEnglish, opts) {
        this.opts = {
          style: "long",
          ...opts
        };
        if (!isEnglish && hasRelative()) {
          this.rtf = getCachedRTF(intl, opts);
        }
      }
      format(count, unit) {
        if (this.rtf) {
          return this.rtf.format(count, unit);
        } else {
          return formatRelativeTime(unit, count, this.opts.numeric, this.opts.style !== "long");
        }
      }
      formatToParts(count, unit) {
        if (this.rtf) {
          return this.rtf.formatToParts(count, unit);
        } else {
          return [];
        }
      }
    };
    var fallbackWeekSettings = {
      firstDay: 1,
      minimalDays: 4,
      weekend: [6, 7]
    };
    var Locale = class _Locale {
      static fromOpts(opts) {
        return _Locale.create(opts.locale, opts.numberingSystem, opts.outputCalendar, opts.weekSettings, opts.defaultToEN);
      }
      static create(locale, numberingSystem, outputCalendar, weekSettings, defaultToEN = false) {
        const specifiedLocale = locale || Settings.defaultLocale;
        const localeR = specifiedLocale || (defaultToEN ? "en-US" : systemLocale());
        const numberingSystemR = numberingSystem || Settings.defaultNumberingSystem;
        const outputCalendarR = outputCalendar || Settings.defaultOutputCalendar;
        const weekSettingsR = validateWeekSettings(weekSettings) || Settings.defaultWeekSettings;
        return new _Locale(localeR, numberingSystemR, outputCalendarR, weekSettingsR, specifiedLocale);
      }
      static resetCache() {
        sysLocaleCache = null;
        intlDTCache.clear();
        intlNumCache.clear();
        intlRelCache.clear();
        intlResolvedOptionsCache.clear();
        weekInfoCache.clear();
      }
      static fromObject({
        locale,
        numberingSystem,
        outputCalendar,
        weekSettings
      } = {}) {
        return _Locale.create(locale, numberingSystem, outputCalendar, weekSettings);
      }
      constructor(locale, numbering, outputCalendar, weekSettings, specifiedLocale) {
        const [parsedLocale, parsedNumberingSystem, parsedOutputCalendar] = parseLocaleString(locale);
        this.locale = parsedLocale;
        this.numberingSystem = numbering || parsedNumberingSystem || null;
        this.outputCalendar = outputCalendar || parsedOutputCalendar || null;
        this.weekSettings = weekSettings;
        this.intl = intlConfigString(this.locale, this.numberingSystem, this.outputCalendar);
        this.weekdaysCache = {
          format: {},
          standalone: {}
        };
        this.monthsCache = {
          format: {},
          standalone: {}
        };
        this.meridiemCache = null;
        this.eraCache = {};
        this.specifiedLocale = specifiedLocale;
        this.fastNumbersCached = null;
      }
      get fastNumbers() {
        if (this.fastNumbersCached == null) {
          this.fastNumbersCached = supportsFastNumbers(this);
        }
        return this.fastNumbersCached;
      }
      listingMode() {
        const isActuallyEn = this.isEnglish();
        const hasNoWeirdness = (this.numberingSystem === null || this.numberingSystem === "latn") && (this.outputCalendar === null || this.outputCalendar === "gregory");
        return isActuallyEn && hasNoWeirdness ? "en" : "intl";
      }
      clone(alts) {
        if (!alts || Object.getOwnPropertyNames(alts).length === 0) {
          return this;
        } else {
          return _Locale.create(alts.locale || this.specifiedLocale, alts.numberingSystem || this.numberingSystem, alts.outputCalendar || this.outputCalendar, validateWeekSettings(alts.weekSettings) || this.weekSettings, alts.defaultToEN || false);
        }
      }
      redefaultToEN(alts = {}) {
        return this.clone({
          ...alts,
          defaultToEN: true
        });
      }
      redefaultToSystem(alts = {}) {
        return this.clone({
          ...alts,
          defaultToEN: false
        });
      }
      months(length, format = false) {
        return listStuff(this, length, months, () => {
          const monthSpecialCase = this.intl === "ja" || this.intl.startsWith("ja-");
          format &= !monthSpecialCase;
          const intl = format ? {
            month: length,
            day: "numeric"
          } : {
            month: length
          }, formatStr = format ? "format" : "standalone";
          if (!this.monthsCache[formatStr][length]) {
            const mapper = !monthSpecialCase ? (dt) => this.extract(dt, intl, "month") : (dt) => this.dtFormatter(dt, intl).format();
            this.monthsCache[formatStr][length] = mapMonths(mapper);
          }
          return this.monthsCache[formatStr][length];
        });
      }
      weekdays(length, format = false) {
        return listStuff(this, length, weekdays, () => {
          const intl = format ? {
            weekday: length,
            year: "numeric",
            month: "long",
            day: "numeric"
          } : {
            weekday: length
          }, formatStr = format ? "format" : "standalone";
          if (!this.weekdaysCache[formatStr][length]) {
            this.weekdaysCache[formatStr][length] = mapWeekdays((dt) => this.extract(dt, intl, "weekday"));
          }
          return this.weekdaysCache[formatStr][length];
        });
      }
      meridiems() {
        return listStuff(this, void 0, () => meridiems, () => {
          if (!this.meridiemCache) {
            const intl = {
              hour: "numeric",
              hourCycle: "h12"
            };
            this.meridiemCache = [DateTime.utc(2016, 11, 13, 9), DateTime.utc(2016, 11, 13, 19)].map((dt) => this.extract(dt, intl, "dayperiod"));
          }
          return this.meridiemCache;
        });
      }
      eras(length) {
        return listStuff(this, length, eras, () => {
          const intl = {
            era: length
          };
          if (!this.eraCache[length]) {
            this.eraCache[length] = [DateTime.utc(-40, 1, 1), DateTime.utc(2017, 1, 1)].map((dt) => this.extract(dt, intl, "era"));
          }
          return this.eraCache[length];
        });
      }
      extract(dt, intlOpts, field) {
        const df = this.dtFormatter(dt, intlOpts), results = df.formatToParts(), matching = results.find((m) => m.type.toLowerCase() === field);
        return matching ? matching.value : null;
      }
      numberFormatter(opts = {}) {
        return new PolyNumberFormatter(this.intl, opts.forceSimple || this.fastNumbers, opts);
      }
      dtFormatter(dt, intlOpts = {}) {
        return new PolyDateFormatter(dt, this.intl, intlOpts);
      }
      relFormatter(opts = {}) {
        return new PolyRelFormatter(this.intl, this.isEnglish(), opts);
      }
      listFormatter(opts = {}) {
        return getCachedLF(this.intl, opts);
      }
      isEnglish() {
        return this.locale === "en" || this.locale.toLowerCase() === "en-us" || getCachedIntResolvedOptions(this.intl).locale.startsWith("en-us");
      }
      getWeekSettings() {
        if (this.weekSettings) {
          return this.weekSettings;
        } else if (!hasLocaleWeekInfo()) {
          return fallbackWeekSettings;
        } else {
          return getCachedWeekInfo(this.locale);
        }
      }
      getStartOfWeek() {
        return this.getWeekSettings().firstDay;
      }
      getMinDaysInFirstWeek() {
        return this.getWeekSettings().minimalDays;
      }
      getWeekendDays() {
        return this.getWeekSettings().weekend;
      }
      equals(other) {
        return this.locale === other.locale && this.numberingSystem === other.numberingSystem && this.outputCalendar === other.outputCalendar;
      }
      toString() {
        return `Locale(${this.locale}, ${this.numberingSystem}, ${this.outputCalendar})`;
      }
    };
    var singleton = null;
    var FixedOffsetZone = class _FixedOffsetZone extends Zone {
      /**
       * Get a singleton instance of UTC
       * @return {FixedOffsetZone}
       */
      static get utcInstance() {
        if (singleton === null) {
          singleton = new _FixedOffsetZone(0);
        }
        return singleton;
      }
      /**
       * Get an instance with a specified offset
       * @param {number} offset - The offset in minutes
       * @return {FixedOffsetZone}
       */
      static instance(offset2) {
        return offset2 === 0 ? _FixedOffsetZone.utcInstance : new _FixedOffsetZone(offset2);
      }
      /**
       * Get an instance of FixedOffsetZone from a UTC offset string, like "UTC+6"
       * @param {string} s - The offset string to parse
       * @example FixedOffsetZone.parseSpecifier("UTC+6")
       * @example FixedOffsetZone.parseSpecifier("UTC+06")
       * @example FixedOffsetZone.parseSpecifier("UTC-6:00")
       * @return {FixedOffsetZone}
       */
      static parseSpecifier(s2) {
        if (s2) {
          const r = s2.match(/^utc(?:([+-]\d{1,2})(?::(\d{2}))?)?$/i);
          if (r) {
            return new _FixedOffsetZone(signedOffset(r[1], r[2]));
          }
        }
        return null;
      }
      constructor(offset2) {
        super();
        this.fixed = offset2;
      }
      /**
       * The type of zone. `fixed` for all instances of `FixedOffsetZone`.
       * @override
       * @type {string}
       */
      get type() {
        return "fixed";
      }
      /**
       * The name of this zone.
       * All fixed zones' names always start with "UTC" (plus optional offset)
       * @override
       * @type {string}
       */
      get name() {
        return this.fixed === 0 ? "UTC" : `UTC${formatOffset(this.fixed, "narrow")}`;
      }
      /**
       * The IANA name of this zone, i.e. `Etc/UTC` or `Etc/GMT+/-nn`
       *
       * @override
       * @type {string}
       */
      get ianaName() {
        if (this.fixed === 0) {
          return "Etc/UTC";
        } else {
          return `Etc/GMT${formatOffset(-this.fixed, "narrow")}`;
        }
      }
      /**
       * Returns the offset's common name at the specified timestamp.
       *
       * For fixed offset zones this equals to the zone name.
       * @override
       */
      offsetName() {
        return this.name;
      }
      /**
       * Returns the offset's value as a string
       * @override
       * @param {number} ts - Epoch milliseconds for which to get the offset
       * @param {string} format - What style of offset to return.
       *                          Accepts 'narrow', 'short', or 'techie'. Returning '+6', '+06:00', or '+0600' respectively
       * @return {string}
       */
      formatOffset(ts, format) {
        return formatOffset(this.fixed, format);
      }
      /**
       * Returns whether the offset is known to be fixed for the whole year:
       * Always returns true for all fixed offset zones.
       * @override
       * @type {boolean}
       */
      get isUniversal() {
        return true;
      }
      /**
       * Return the offset in minutes for this zone at the specified timestamp.
       *
       * For fixed offset zones, this is constant and does not depend on a timestamp.
       * @override
       * @return {number}
       */
      offset() {
        return this.fixed;
      }
      /**
       * Return whether this Zone is equal to another zone (i.e. also fixed and same offset)
       * @override
       * @param {Zone} otherZone - the zone to compare
       * @return {boolean}
       */
      equals(otherZone) {
        return otherZone.type === "fixed" && otherZone.fixed === this.fixed;
      }
      /**
       * Return whether this Zone is valid:
       * All fixed offset zones are valid.
       * @override
       * @type {boolean}
       */
      get isValid() {
        return true;
      }
    };
    var InvalidZone = class extends Zone {
      constructor(zoneName) {
        super();
        this.zoneName = zoneName;
      }
      /** @override **/
      get type() {
        return "invalid";
      }
      /** @override **/
      get name() {
        return this.zoneName;
      }
      /** @override **/
      get isUniversal() {
        return false;
      }
      /** @override **/
      offsetName() {
        return null;
      }
      /** @override **/
      formatOffset() {
        return "";
      }
      /** @override **/
      offset() {
        return NaN;
      }
      /** @override **/
      equals() {
        return false;
      }
      /** @override **/
      get isValid() {
        return false;
      }
    };
    function normalizeZone(input, defaultZone2) {
      if (isUndefined(input) || input === null) {
        return defaultZone2;
      } else if (input instanceof Zone) {
        return input;
      } else if (isString(input)) {
        const lowered = input.toLowerCase();
        if (lowered === "default") return defaultZone2;
        else if (lowered === "local" || lowered === "system") return SystemZone.instance;
        else if (lowered === "utc" || lowered === "gmt") return FixedOffsetZone.utcInstance;
        else return FixedOffsetZone.parseSpecifier(lowered) || IANAZone.create(input);
      } else if (isNumber(input)) {
        return FixedOffsetZone.instance(input);
      } else if (typeof input === "object" && "offset" in input && typeof input.offset === "function") {
        return input;
      } else {
        return new InvalidZone(input);
      }
    }
    var numberingSystems = {
      arab: "[\u0660-\u0669]",
      arabext: "[\u06F0-\u06F9]",
      bali: "[\u1B50-\u1B59]",
      beng: "[\u09E6-\u09EF]",
      deva: "[\u0966-\u096F]",
      fullwide: "[\uFF10-\uFF19]",
      gujr: "[\u0AE6-\u0AEF]",
      hanidec: "[\u3007|\u4E00|\u4E8C|\u4E09|\u56DB|\u4E94|\u516D|\u4E03|\u516B|\u4E5D]",
      khmr: "[\u17E0-\u17E9]",
      knda: "[\u0CE6-\u0CEF]",
      laoo: "[\u0ED0-\u0ED9]",
      limb: "[\u1946-\u194F]",
      mlym: "[\u0D66-\u0D6F]",
      mong: "[\u1810-\u1819]",
      mymr: "[\u1040-\u1049]",
      orya: "[\u0B66-\u0B6F]",
      tamldec: "[\u0BE6-\u0BEF]",
      telu: "[\u0C66-\u0C6F]",
      thai: "[\u0E50-\u0E59]",
      tibt: "[\u0F20-\u0F29]",
      latn: "\\d"
    };
    var numberingSystemsUTF16 = {
      arab: [1632, 1641],
      arabext: [1776, 1785],
      bali: [6992, 7001],
      beng: [2534, 2543],
      deva: [2406, 2415],
      fullwide: [65296, 65303],
      gujr: [2790, 2799],
      khmr: [6112, 6121],
      knda: [3302, 3311],
      laoo: [3792, 3801],
      limb: [6470, 6479],
      mlym: [3430, 3439],
      mong: [6160, 6169],
      mymr: [4160, 4169],
      orya: [2918, 2927],
      tamldec: [3046, 3055],
      telu: [3174, 3183],
      thai: [3664, 3673],
      tibt: [3872, 3881]
    };
    var hanidecChars = numberingSystems.hanidec.replace(/[\[|\]]/g, "").split("");
    function parseDigits(str2) {
      let value = parseInt(str2, 10);
      if (isNaN(value)) {
        value = "";
        for (let i = 0; i < str2.length; i++) {
          const code = str2.charCodeAt(i);
          if (str2[i].search(numberingSystems.hanidec) !== -1) {
            value += hanidecChars.indexOf(str2[i]);
          } else {
            for (const key in numberingSystemsUTF16) {
              const [min, max] = numberingSystemsUTF16[key];
              if (code >= min && code <= max) {
                value += code - min;
              }
            }
          }
        }
        return parseInt(value, 10);
      } else {
        return value;
      }
    }
    var digitRegexCache = /* @__PURE__ */ new Map();
    function resetDigitRegexCache() {
      digitRegexCache.clear();
    }
    function digitRegex({
      numberingSystem
    }, append = "") {
      const ns = numberingSystem || "latn";
      let appendCache = digitRegexCache.get(ns);
      if (appendCache === void 0) {
        appendCache = /* @__PURE__ */ new Map();
        digitRegexCache.set(ns, appendCache);
      }
      let regex = appendCache.get(append);
      if (regex === void 0) {
        regex = new RegExp(`${numberingSystems[ns]}${append}`);
        appendCache.set(append, regex);
      }
      return regex;
    }
    var now = () => Date.now();
    var defaultZone = "system";
    var defaultLocale = null;
    var defaultNumberingSystem = null;
    var defaultOutputCalendar = null;
    var twoDigitCutoffYear = 60;
    var throwOnInvalid;
    var defaultWeekSettings = null;
    var Settings = class {
      /**
       * Get the callback for returning the current timestamp.
       * @type {function}
       */
      static get now() {
        return now;
      }
      /**
       * Set the callback for returning the current timestamp.
       * The function should return a number, which will be interpreted as an Epoch millisecond count
       * @type {function}
       * @example Settings.now = () => Date.now() + 3000 // pretend it is 3 seconds in the future
       * @example Settings.now = () => 0 // always pretend it's Jan 1, 1970 at midnight in UTC time
       */
      static set now(n2) {
        now = n2;
      }
      /**
       * Set the default time zone to create DateTimes in. Does not affect existing instances.
       * Use the value "system" to reset this value to the system's time zone.
       * @type {string}
       */
      static set defaultZone(zone) {
        defaultZone = zone;
      }
      /**
       * Get the default time zone object currently used to create DateTimes. Does not affect existing instances.
       * The default value is the system's time zone (the one set on the machine that runs this code).
       * @type {Zone}
       */
      static get defaultZone() {
        return normalizeZone(defaultZone, SystemZone.instance);
      }
      /**
       * Get the default locale to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static get defaultLocale() {
        return defaultLocale;
      }
      /**
       * Set the default locale to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static set defaultLocale(locale) {
        defaultLocale = locale;
      }
      /**
       * Get the default numbering system to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static get defaultNumberingSystem() {
        return defaultNumberingSystem;
      }
      /**
       * Set the default numbering system to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static set defaultNumberingSystem(numberingSystem) {
        defaultNumberingSystem = numberingSystem;
      }
      /**
       * Get the default output calendar to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static get defaultOutputCalendar() {
        return defaultOutputCalendar;
      }
      /**
       * Set the default output calendar to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static set defaultOutputCalendar(outputCalendar) {
        defaultOutputCalendar = outputCalendar;
      }
      /**
       * @typedef {Object} WeekSettings
       * @property {number} firstDay
       * @property {number} minimalDays
       * @property {number[]} weekend
       */
      /**
       * @return {WeekSettings|null}
       */
      static get defaultWeekSettings() {
        return defaultWeekSettings;
      }
      /**
       * Allows overriding the default locale week settings, i.e. the start of the week, the weekend and
       * how many days are required in the first week of a year.
       * Does not affect existing instances.
       *
       * @param {WeekSettings|null} weekSettings
       */
      static set defaultWeekSettings(weekSettings) {
        defaultWeekSettings = validateWeekSettings(weekSettings);
      }
      /**
       * Get the cutoff year for whether a 2-digit year string is interpreted in the current or previous century. Numbers higher than the cutoff will be considered to mean 19xx and numbers lower or equal to the cutoff will be considered 20xx.
       * @type {number}
       */
      static get twoDigitCutoffYear() {
        return twoDigitCutoffYear;
      }
      /**
       * Set the cutoff year for whether a 2-digit year string is interpreted in the current or previous century. Numbers higher than the cutoff will be considered to mean 19xx and numbers lower or equal to the cutoff will be considered 20xx.
       * @type {number}
       * @example Settings.twoDigitCutoffYear = 0 // all 'yy' are interpreted as 20th century
       * @example Settings.twoDigitCutoffYear = 99 // all 'yy' are interpreted as 21st century
       * @example Settings.twoDigitCutoffYear = 50 // '49' -> 2049; '50' -> 1950
       * @example Settings.twoDigitCutoffYear = 1950 // interpreted as 50
       * @example Settings.twoDigitCutoffYear = 2050 // ALSO interpreted as 50
       */
      static set twoDigitCutoffYear(cutoffYear) {
        twoDigitCutoffYear = cutoffYear % 100;
      }
      /**
       * Get whether Luxon will throw when it encounters invalid DateTimes, Durations, or Intervals
       * @type {boolean}
       */
      static get throwOnInvalid() {
        return throwOnInvalid;
      }
      /**
       * Set whether Luxon will throw when it encounters invalid DateTimes, Durations, or Intervals
       * @type {boolean}
       */
      static set throwOnInvalid(t) {
        throwOnInvalid = t;
      }
      /**
       * Reset Luxon's global caches. Should only be necessary in testing scenarios.
       * @return {void}
       */
      static resetCaches() {
        Locale.resetCache();
        IANAZone.resetCache();
        DateTime.resetCache();
        resetDigitRegexCache();
      }
    };
    var Invalid = class {
      constructor(reason, explanation) {
        this.reason = reason;
        this.explanation = explanation;
      }
      toMessage() {
        if (this.explanation) {
          return `${this.reason}: ${this.explanation}`;
        } else {
          return this.reason;
        }
      }
    };
    var nonLeapLadder = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    var leapLadder = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
    function unitOutOfRange(unit, value) {
      return new Invalid("unit out of range", `you specified ${value} (of type ${typeof value}) as a ${unit}, which is invalid`);
    }
    function dayOfWeek(year, month, day) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (year < 100 && year >= 0) {
        d.setUTCFullYear(d.getUTCFullYear() - 1900);
      }
      const js = d.getUTCDay();
      return js === 0 ? 7 : js;
    }
    function computeOrdinal(year, month, day) {
      return day + (isLeapYear(year) ? leapLadder : nonLeapLadder)[month - 1];
    }
    function uncomputeOrdinal(year, ordinal) {
      const table = isLeapYear(year) ? leapLadder : nonLeapLadder, month0 = table.findIndex((i) => i < ordinal), day = ordinal - table[month0];
      return {
        month: month0 + 1,
        day
      };
    }
    function isoWeekdayToLocal(isoWeekday, startOfWeek) {
      return (isoWeekday - startOfWeek + 7) % 7 + 1;
    }
    function gregorianToWeek(gregObj, minDaysInFirstWeek = 4, startOfWeek = 1) {
      const {
        year,
        month,
        day
      } = gregObj, ordinal = computeOrdinal(year, month, day), weekday = isoWeekdayToLocal(dayOfWeek(year, month, day), startOfWeek);
      let weekNumber = Math.floor((ordinal - weekday + 14 - minDaysInFirstWeek) / 7), weekYear;
      if (weekNumber < 1) {
        weekYear = year - 1;
        weekNumber = weeksInWeekYear(weekYear, minDaysInFirstWeek, startOfWeek);
      } else if (weekNumber > weeksInWeekYear(year, minDaysInFirstWeek, startOfWeek)) {
        weekYear = year + 1;
        weekNumber = 1;
      } else {
        weekYear = year;
      }
      return {
        weekYear,
        weekNumber,
        weekday,
        ...timeObject(gregObj)
      };
    }
    function weekToGregorian(weekData, minDaysInFirstWeek = 4, startOfWeek = 1) {
      const {
        weekYear,
        weekNumber,
        weekday
      } = weekData, weekdayOfJan4 = isoWeekdayToLocal(dayOfWeek(weekYear, 1, minDaysInFirstWeek), startOfWeek), yearInDays = daysInYear(weekYear);
      let ordinal = weekNumber * 7 + weekday - weekdayOfJan4 - 7 + minDaysInFirstWeek, year;
      if (ordinal < 1) {
        year = weekYear - 1;
        ordinal += daysInYear(year);
      } else if (ordinal > yearInDays) {
        year = weekYear + 1;
        ordinal -= daysInYear(weekYear);
      } else {
        year = weekYear;
      }
      const {
        month,
        day
      } = uncomputeOrdinal(year, ordinal);
      return {
        year,
        month,
        day,
        ...timeObject(weekData)
      };
    }
    function gregorianToOrdinal(gregData) {
      const {
        year,
        month,
        day
      } = gregData;
      const ordinal = computeOrdinal(year, month, day);
      return {
        year,
        ordinal,
        ...timeObject(gregData)
      };
    }
    function ordinalToGregorian(ordinalData) {
      const {
        year,
        ordinal
      } = ordinalData;
      const {
        month,
        day
      } = uncomputeOrdinal(year, ordinal);
      return {
        year,
        month,
        day,
        ...timeObject(ordinalData)
      };
    }
    function usesLocalWeekValues(obj, loc) {
      const hasLocaleWeekData = !isUndefined(obj.localWeekday) || !isUndefined(obj.localWeekNumber) || !isUndefined(obj.localWeekYear);
      if (hasLocaleWeekData) {
        const hasIsoWeekData = !isUndefined(obj.weekday) || !isUndefined(obj.weekNumber) || !isUndefined(obj.weekYear);
        if (hasIsoWeekData) {
          throw new ConflictingSpecificationError("Cannot mix locale-based week fields with ISO-based week fields");
        }
        if (!isUndefined(obj.localWeekday)) obj.weekday = obj.localWeekday;
        if (!isUndefined(obj.localWeekNumber)) obj.weekNumber = obj.localWeekNumber;
        if (!isUndefined(obj.localWeekYear)) obj.weekYear = obj.localWeekYear;
        delete obj.localWeekday;
        delete obj.localWeekNumber;
        delete obj.localWeekYear;
        return {
          minDaysInFirstWeek: loc.getMinDaysInFirstWeek(),
          startOfWeek: loc.getStartOfWeek()
        };
      } else {
        return {
          minDaysInFirstWeek: 4,
          startOfWeek: 1
        };
      }
    }
    function hasInvalidWeekData(obj, minDaysInFirstWeek = 4, startOfWeek = 1) {
      const validYear = isInteger(obj.weekYear), validWeek = integerBetween(obj.weekNumber, 1, weeksInWeekYear(obj.weekYear, minDaysInFirstWeek, startOfWeek)), validWeekday = integerBetween(obj.weekday, 1, 7);
      if (!validYear) {
        return unitOutOfRange("weekYear", obj.weekYear);
      } else if (!validWeek) {
        return unitOutOfRange("week", obj.weekNumber);
      } else if (!validWeekday) {
        return unitOutOfRange("weekday", obj.weekday);
      } else return false;
    }
    function hasInvalidOrdinalData(obj) {
      const validYear = isInteger(obj.year), validOrdinal = integerBetween(obj.ordinal, 1, daysInYear(obj.year));
      if (!validYear) {
        return unitOutOfRange("year", obj.year);
      } else if (!validOrdinal) {
        return unitOutOfRange("ordinal", obj.ordinal);
      } else return false;
    }
    function hasInvalidGregorianData(obj) {
      const validYear = isInteger(obj.year), validMonth = integerBetween(obj.month, 1, 12), validDay = integerBetween(obj.day, 1, daysInMonth(obj.year, obj.month));
      if (!validYear) {
        return unitOutOfRange("year", obj.year);
      } else if (!validMonth) {
        return unitOutOfRange("month", obj.month);
      } else if (!validDay) {
        return unitOutOfRange("day", obj.day);
      } else return false;
    }
    function hasInvalidTimeData(obj) {
      const {
        hour,
        minute,
        second,
        millisecond
      } = obj;
      const validHour = integerBetween(hour, 0, 23) || hour === 24 && minute === 0 && second === 0 && millisecond === 0, validMinute = integerBetween(minute, 0, 59), validSecond = integerBetween(second, 0, 59), validMillisecond = integerBetween(millisecond, 0, 999);
      if (!validHour) {
        return unitOutOfRange("hour", hour);
      } else if (!validMinute) {
        return unitOutOfRange("minute", minute);
      } else if (!validSecond) {
        return unitOutOfRange("second", second);
      } else if (!validMillisecond) {
        return unitOutOfRange("millisecond", millisecond);
      } else return false;
    }
    function isUndefined(o) {
      return typeof o === "undefined";
    }
    function isNumber(o) {
      return typeof o === "number";
    }
    function isInteger(o) {
      return typeof o === "number" && o % 1 === 0;
    }
    function isString(o) {
      return typeof o === "string";
    }
    function isDate(o) {
      return Object.prototype.toString.call(o) === "[object Date]";
    }
    function hasRelative() {
      try {
        return typeof Intl !== "undefined" && !!Intl.RelativeTimeFormat;
      } catch (e) {
        return false;
      }
    }
    function hasLocaleWeekInfo() {
      try {
        return typeof Intl !== "undefined" && !!Intl.Locale && ("weekInfo" in Intl.Locale.prototype || "getWeekInfo" in Intl.Locale.prototype);
      } catch (e) {
        return false;
      }
    }
    function maybeArray(thing) {
      return Array.isArray(thing) ? thing : [thing];
    }
    function bestBy(arr, by, compare) {
      if (arr.length === 0) {
        return void 0;
      }
      return arr.reduce((best, next) => {
        const pair = [by(next), next];
        if (!best) {
          return pair;
        } else if (compare(best[0], pair[0]) === best[0]) {
          return best;
        } else {
          return pair;
        }
      }, null)[1];
    }
    function pick(obj, keys) {
      return keys.reduce((a, k) => {
        a[k] = obj[k];
        return a;
      }, {});
    }
    function hasOwnProperty(obj, prop) {
      return Object.prototype.hasOwnProperty.call(obj, prop);
    }
    function validateWeekSettings(settings) {
      if (settings == null) {
        return null;
      } else if (typeof settings !== "object") {
        throw new InvalidArgumentError("Week settings must be an object");
      } else {
        if (!integerBetween(settings.firstDay, 1, 7) || !integerBetween(settings.minimalDays, 1, 7) || !Array.isArray(settings.weekend) || settings.weekend.some((v) => !integerBetween(v, 1, 7))) {
          throw new InvalidArgumentError("Invalid week settings");
        }
        return {
          firstDay: settings.firstDay,
          minimalDays: settings.minimalDays,
          weekend: Array.from(settings.weekend)
        };
      }
    }
    function integerBetween(thing, bottom, top) {
      return isInteger(thing) && thing >= bottom && thing <= top;
    }
    function floorMod(x, n2) {
      return x - n2 * Math.floor(x / n2);
    }
    function padStart(input, n2 = 2) {
      const isNeg = input < 0;
      let padded;
      if (isNeg) {
        padded = "-" + ("" + -input).padStart(n2, "0");
      } else {
        padded = ("" + input).padStart(n2, "0");
      }
      return padded;
    }
    function parseInteger(string) {
      if (isUndefined(string) || string === null || string === "") {
        return void 0;
      } else {
        return parseInt(string, 10);
      }
    }
    function parseFloating(string) {
      if (isUndefined(string) || string === null || string === "") {
        return void 0;
      } else {
        return parseFloat(string);
      }
    }
    function parseMillis(fraction) {
      if (isUndefined(fraction) || fraction === null || fraction === "") {
        return void 0;
      } else {
        const f = parseFloat("0." + fraction) * 1e3;
        return Math.floor(f);
      }
    }
    function roundTo(number, digits, rounding = "round") {
      const factor = 10 ** digits;
      switch (rounding) {
        case "expand":
          return number > 0 ? Math.ceil(number * factor) / factor : Math.floor(number * factor) / factor;
        case "trunc":
          return Math.trunc(number * factor) / factor;
        case "round":
          return Math.round(number * factor) / factor;
        case "floor":
          return Math.floor(number * factor) / factor;
        case "ceil":
          return Math.ceil(number * factor) / factor;
        default:
          throw new RangeError(`Value rounding ${rounding} is out of range`);
      }
    }
    function isLeapYear(year) {
      return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    }
    function daysInYear(year) {
      return isLeapYear(year) ? 366 : 365;
    }
    function daysInMonth(year, month) {
      const modMonth = floorMod(month - 1, 12) + 1, modYear = year + (month - modMonth) / 12;
      if (modMonth === 2) {
        return isLeapYear(modYear) ? 29 : 28;
      } else {
        return [31, null, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][modMonth - 1];
      }
    }
    function objToLocalTS(obj) {
      let d = Date.UTC(obj.year, obj.month - 1, obj.day, obj.hour, obj.minute, obj.second, obj.millisecond);
      if (obj.year < 100 && obj.year >= 0) {
        d = new Date(d);
        d.setUTCFullYear(obj.year, obj.month - 1, obj.day);
      }
      return +d;
    }
    function firstWeekOffset(year, minDaysInFirstWeek, startOfWeek) {
      const fwdlw = isoWeekdayToLocal(dayOfWeek(year, 1, minDaysInFirstWeek), startOfWeek);
      return -fwdlw + minDaysInFirstWeek - 1;
    }
    function weeksInWeekYear(weekYear, minDaysInFirstWeek = 4, startOfWeek = 1) {
      const weekOffset = firstWeekOffset(weekYear, minDaysInFirstWeek, startOfWeek);
      const weekOffsetNext = firstWeekOffset(weekYear + 1, minDaysInFirstWeek, startOfWeek);
      return (daysInYear(weekYear) - weekOffset + weekOffsetNext) / 7;
    }
    function untruncateYear(year) {
      if (year > 99) {
        return year;
      } else return year > Settings.twoDigitCutoffYear ? 1900 + year : 2e3 + year;
    }
    function parseZoneInfo(ts, offsetFormat, locale, timeZone = null) {
      const date = new Date(ts), intlOpts = {
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      };
      if (timeZone) {
        intlOpts.timeZone = timeZone;
      }
      const modified = {
        timeZoneName: offsetFormat,
        ...intlOpts
      };
      const parsed = new Intl.DateTimeFormat(locale, modified).formatToParts(date).find((m) => m.type.toLowerCase() === "timezonename");
      return parsed ? parsed.value : null;
    }
    function signedOffset(offHourStr, offMinuteStr) {
      let offHour = parseInt(offHourStr, 10);
      if (Number.isNaN(offHour)) {
        offHour = 0;
      }
      const offMin = parseInt(offMinuteStr, 10) || 0, offMinSigned = offHour < 0 || Object.is(offHour, -0) ? -offMin : offMin;
      return offHour * 60 + offMinSigned;
    }
    function asNumber(value) {
      const numericValue = Number(value);
      if (typeof value === "boolean" || value === "" || !Number.isFinite(numericValue)) throw new InvalidArgumentError(`Invalid unit value ${value}`);
      return numericValue;
    }
    function normalizeObject(obj, normalizer) {
      const normalized = {};
      for (const u in obj) {
        if (hasOwnProperty(obj, u)) {
          const v = obj[u];
          if (v === void 0 || v === null) continue;
          normalized[normalizer(u)] = asNumber(v);
        }
      }
      return normalized;
    }
    function formatOffset(offset2, format) {
      const hours = Math.trunc(Math.abs(offset2 / 60)), minutes = Math.trunc(Math.abs(offset2 % 60)), sign = offset2 >= 0 ? "+" : "-";
      switch (format) {
        case "short":
          return `${sign}${padStart(hours, 2)}:${padStart(minutes, 2)}`;
        case "narrow":
          return `${sign}${hours}${minutes > 0 ? `:${minutes}` : ""}`;
        case "techie":
          return `${sign}${padStart(hours, 2)}${padStart(minutes, 2)}`;
        default:
          throw new RangeError(`Value format ${format} is out of range for property format`);
      }
    }
    function timeObject(obj) {
      return pick(obj, ["hour", "minute", "second", "millisecond"]);
    }
    var monthsLong = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var monthsNarrow = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
    function months(length) {
      switch (length) {
        case "narrow":
          return [...monthsNarrow];
        case "short":
          return [...monthsShort];
        case "long":
          return [...monthsLong];
        case "numeric":
          return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
        case "2-digit":
          return ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
        default:
          return null;
      }
    }
    var weekdaysLong = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    var weekdaysShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    var weekdaysNarrow = ["M", "T", "W", "T", "F", "S", "S"];
    function weekdays(length) {
      switch (length) {
        case "narrow":
          return [...weekdaysNarrow];
        case "short":
          return [...weekdaysShort];
        case "long":
          return [...weekdaysLong];
        case "numeric":
          return ["1", "2", "3", "4", "5", "6", "7"];
        default:
          return null;
      }
    }
    var meridiems = ["AM", "PM"];
    var erasLong = ["Before Christ", "Anno Domini"];
    var erasShort = ["BC", "AD"];
    var erasNarrow = ["B", "A"];
    function eras(length) {
      switch (length) {
        case "narrow":
          return [...erasNarrow];
        case "short":
          return [...erasShort];
        case "long":
          return [...erasLong];
        default:
          return null;
      }
    }
    function meridiemForDateTime(dt) {
      return meridiems[dt.hour < 12 ? 0 : 1];
    }
    function weekdayForDateTime(dt, length) {
      return weekdays(length)[dt.weekday - 1];
    }
    function monthForDateTime(dt, length) {
      return months(length)[dt.month - 1];
    }
    function eraForDateTime(dt, length) {
      return eras(length)[dt.year < 0 ? 0 : 1];
    }
    function formatRelativeTime(unit, count, numeric = "always", narrow = false) {
      const units = {
        years: ["year", "yr."],
        quarters: ["quarter", "qtr."],
        months: ["month", "mo."],
        weeks: ["week", "wk."],
        days: ["day", "day", "days"],
        hours: ["hour", "hr."],
        minutes: ["minute", "min."],
        seconds: ["second", "sec."]
      };
      const lastable = ["hours", "minutes", "seconds"].indexOf(unit) === -1;
      if (numeric === "auto" && lastable) {
        const isDay = unit === "days";
        switch (count) {
          case 1:
            return isDay ? "tomorrow" : `next ${units[unit][0]}`;
          case -1:
            return isDay ? "yesterday" : `last ${units[unit][0]}`;
          case 0:
            return isDay ? "today" : `this ${units[unit][0]}`;
        }
      }
      const isInPast = Object.is(count, -0) || count < 0, fmtValue = Math.abs(count), singular = fmtValue === 1, lilUnits = units[unit], fmtUnit = narrow ? singular ? lilUnits[1] : lilUnits[2] || lilUnits[1] : singular ? units[unit][0] : unit;
      return isInPast ? `${fmtValue} ${fmtUnit} ago` : `in ${fmtValue} ${fmtUnit}`;
    }
    function stringifyTokens(splits, tokenToString) {
      let s2 = "";
      for (const token of splits) {
        if (token.literal) {
          s2 += token.val;
        } else {
          s2 += tokenToString(token.val);
        }
      }
      return s2;
    }
    var macroTokenToFormatOpts = {
      D: DATE_SHORT,
      DD: DATE_MED,
      DDD: DATE_FULL,
      DDDD: DATE_HUGE,
      t: TIME_SIMPLE,
      tt: TIME_WITH_SECONDS,
      ttt: TIME_WITH_SHORT_OFFSET,
      tttt: TIME_WITH_LONG_OFFSET,
      T: TIME_24_SIMPLE,
      TT: TIME_24_WITH_SECONDS,
      TTT: TIME_24_WITH_SHORT_OFFSET,
      TTTT: TIME_24_WITH_LONG_OFFSET,
      f: DATETIME_SHORT,
      ff: DATETIME_MED,
      fff: DATETIME_FULL,
      ffff: DATETIME_HUGE,
      F: DATETIME_SHORT_WITH_SECONDS,
      FF: DATETIME_MED_WITH_SECONDS,
      FFF: DATETIME_FULL_WITH_SECONDS,
      FFFF: DATETIME_HUGE_WITH_SECONDS
    };
    var Formatter = class _Formatter {
      static create(locale, opts = {}) {
        return new _Formatter(locale, opts);
      }
      static parseFormat(fmt) {
        let current = null, currentFull = "", bracketed = false;
        const splits = [];
        for (let i = 0; i < fmt.length; i++) {
          const c = fmt.charAt(i);
          if (c === "'") {
            if (currentFull.length > 0 || bracketed) {
              splits.push({
                literal: bracketed || /^\s+$/.test(currentFull),
                val: currentFull === "" ? "'" : currentFull
              });
            }
            current = null;
            currentFull = "";
            bracketed = !bracketed;
          } else if (bracketed) {
            currentFull += c;
          } else if (c === current) {
            currentFull += c;
          } else {
            if (currentFull.length > 0) {
              splits.push({
                literal: /^\s+$/.test(currentFull),
                val: currentFull
              });
            }
            currentFull = c;
            current = c;
          }
        }
        if (currentFull.length > 0) {
          splits.push({
            literal: bracketed || /^\s+$/.test(currentFull),
            val: currentFull
          });
        }
        return splits;
      }
      static macroTokenToFormatOpts(token) {
        return macroTokenToFormatOpts[token];
      }
      constructor(locale, formatOpts) {
        this.opts = formatOpts;
        this.loc = locale;
        this.systemLoc = null;
      }
      formatWithSystemDefault(dt, opts) {
        if (this.systemLoc === null) {
          this.systemLoc = this.loc.redefaultToSystem();
        }
        const df = this.systemLoc.dtFormatter(dt, {
          ...this.opts,
          ...opts
        });
        return df.format();
      }
      dtFormatter(dt, opts = {}) {
        return this.loc.dtFormatter(dt, {
          ...this.opts,
          ...opts
        });
      }
      formatDateTime(dt, opts) {
        return this.dtFormatter(dt, opts).format();
      }
      formatDateTimeParts(dt, opts) {
        return this.dtFormatter(dt, opts).formatToParts();
      }
      formatInterval(interval, opts) {
        const df = this.dtFormatter(interval.start, opts);
        return df.dtf.formatRange(interval.start.toJSDate(), interval.end.toJSDate());
      }
      resolvedOptions(dt, opts) {
        return this.dtFormatter(dt, opts).resolvedOptions();
      }
      num(n2, p = 0, signDisplay = void 0) {
        if (this.opts.forceSimple) {
          return padStart(n2, p);
        }
        const opts = {
          ...this.opts
        };
        if (p > 0) {
          opts.padTo = p;
        }
        if (signDisplay) {
          opts.signDisplay = signDisplay;
        }
        return this.loc.numberFormatter(opts).format(n2);
      }
      formatDateTimeFromString(dt, fmt) {
        const knownEnglish = this.loc.listingMode() === "en", useDateTimeFormatter = this.loc.outputCalendar && this.loc.outputCalendar !== "gregory", string = (opts, extract) => this.loc.extract(dt, opts, extract), formatOffset2 = (opts) => {
          if (dt.isOffsetFixed && dt.offset === 0 && opts.allowZ) {
            return "Z";
          }
          return dt.isValid ? dt.zone.formatOffset(dt.ts, opts.format) : "";
        }, meridiem = () => knownEnglish ? meridiemForDateTime(dt) : string({
          hour: "numeric",
          hourCycle: "h12"
        }, "dayperiod"), month = (length, standalone) => knownEnglish ? monthForDateTime(dt, length) : string(standalone ? {
          month: length
        } : {
          month: length,
          day: "numeric"
        }, "month"), weekday = (length, standalone) => knownEnglish ? weekdayForDateTime(dt, length) : string(standalone ? {
          weekday: length
        } : {
          weekday: length,
          month: "long",
          day: "numeric"
        }, "weekday"), maybeMacro = (token) => {
          const formatOpts = _Formatter.macroTokenToFormatOpts(token);
          if (formatOpts) {
            return this.formatWithSystemDefault(dt, formatOpts);
          } else {
            return token;
          }
        }, era = (length) => knownEnglish ? eraForDateTime(dt, length) : string({
          era: length
        }, "era"), tokenToString = (token) => {
          switch (token) {
            // ms
            case "S":
              return this.num(dt.millisecond);
            case "u":
            // falls through
            case "SSS":
              return this.num(dt.millisecond, 3);
            // seconds
            case "s":
              return this.num(dt.second);
            case "ss":
              return this.num(dt.second, 2);
            // fractional seconds
            case "uu":
              return this.num(Math.floor(dt.millisecond / 10), 2);
            case "uuu":
              return this.num(Math.floor(dt.millisecond / 100));
            // minutes
            case "m":
              return this.num(dt.minute);
            case "mm":
              return this.num(dt.minute, 2);
            // hours
            case "h":
              return this.num(dt.hour % 12 === 0 ? 12 : dt.hour % 12);
            case "hh":
              return this.num(dt.hour % 12 === 0 ? 12 : dt.hour % 12, 2);
            case "H":
              return this.num(dt.hour);
            case "HH":
              return this.num(dt.hour, 2);
            // offset
            case "Z":
              return formatOffset2({
                format: "narrow",
                allowZ: this.opts.allowZ
              });
            case "ZZ":
              return formatOffset2({
                format: "short",
                allowZ: this.opts.allowZ
              });
            case "ZZZ":
              return formatOffset2({
                format: "techie",
                allowZ: this.opts.allowZ
              });
            case "ZZZZ":
              return dt.zone.offsetName(dt.ts, {
                format: "short",
                locale: this.loc.locale
              });
            case "ZZZZZ":
              return dt.zone.offsetName(dt.ts, {
                format: "long",
                locale: this.loc.locale
              });
            // zone
            case "z":
              return dt.zoneName;
            // meridiems
            case "a":
              return meridiem();
            // dates
            case "d":
              return useDateTimeFormatter ? string({
                day: "numeric"
              }, "day") : this.num(dt.day);
            case "dd":
              return useDateTimeFormatter ? string({
                day: "2-digit"
              }, "day") : this.num(dt.day, 2);
            // weekdays - standalone
            case "c":
              return this.num(dt.weekday);
            case "ccc":
              return weekday("short", true);
            case "cccc":
              return weekday("long", true);
            case "ccccc":
              return weekday("narrow", true);
            // weekdays - format
            case "E":
              return this.num(dt.weekday);
            case "EEE":
              return weekday("short", false);
            case "EEEE":
              return weekday("long", false);
            case "EEEEE":
              return weekday("narrow", false);
            // months - standalone
            case "L":
              return useDateTimeFormatter ? string({
                month: "numeric",
                day: "numeric"
              }, "month") : this.num(dt.month);
            case "LL":
              return useDateTimeFormatter ? string({
                month: "2-digit",
                day: "numeric"
              }, "month") : this.num(dt.month, 2);
            case "LLL":
              return month("short", true);
            case "LLLL":
              return month("long", true);
            case "LLLLL":
              return month("narrow", true);
            // months - format
            case "M":
              return useDateTimeFormatter ? string({
                month: "numeric"
              }, "month") : this.num(dt.month);
            case "MM":
              return useDateTimeFormatter ? string({
                month: "2-digit"
              }, "month") : this.num(dt.month, 2);
            case "MMM":
              return month("short", false);
            case "MMMM":
              return month("long", false);
            case "MMMMM":
              return month("narrow", false);
            // years
            case "y":
              return useDateTimeFormatter ? string({
                year: "numeric"
              }, "year") : this.num(dt.year);
            case "yy":
              return useDateTimeFormatter ? string({
                year: "2-digit"
              }, "year") : this.num(dt.year.toString().slice(-2), 2);
            case "yyyy":
              return useDateTimeFormatter ? string({
                year: "numeric"
              }, "year") : this.num(dt.year, 4);
            case "yyyyyy":
              return useDateTimeFormatter ? string({
                year: "numeric"
              }, "year") : this.num(dt.year, 6);
            // eras
            case "G":
              return era("short");
            case "GG":
              return era("long");
            case "GGGGG":
              return era("narrow");
            case "kk":
              return this.num(dt.weekYear.toString().slice(-2), 2);
            case "kkkk":
              return this.num(dt.weekYear, 4);
            case "W":
              return this.num(dt.weekNumber);
            case "WW":
              return this.num(dt.weekNumber, 2);
            case "n":
              return this.num(dt.localWeekNumber);
            case "nn":
              return this.num(dt.localWeekNumber, 2);
            case "ii":
              return this.num(dt.localWeekYear.toString().slice(-2), 2);
            case "iiii":
              return this.num(dt.localWeekYear, 4);
            case "o":
              return this.num(dt.ordinal);
            case "ooo":
              return this.num(dt.ordinal, 3);
            case "q":
              return this.num(dt.quarter);
            case "qq":
              return this.num(dt.quarter, 2);
            case "X":
              return this.num(Math.floor(dt.ts / 1e3));
            case "x":
              return this.num(dt.ts);
            default:
              return maybeMacro(token);
          }
        };
        return stringifyTokens(_Formatter.parseFormat(fmt), tokenToString);
      }
      formatDurationFromString(dur, fmt) {
        const invertLargest = this.opts.signMode === "negativeLargestOnly" ? -1 : 1;
        const tokenToField = (token) => {
          switch (token[0]) {
            case "S":
              return "milliseconds";
            case "s":
              return "seconds";
            case "m":
              return "minutes";
            case "h":
              return "hours";
            case "d":
              return "days";
            case "w":
              return "weeks";
            case "M":
              return "months";
            case "y":
              return "years";
            default:
              return null;
          }
        }, tokenToString = (lildur, info) => (token) => {
          const mapped = tokenToField(token);
          if (mapped) {
            const inversionFactor = info.isNegativeDuration && mapped !== info.largestUnit ? invertLargest : 1;
            let signDisplay;
            if (this.opts.signMode === "negativeLargestOnly" && mapped !== info.largestUnit) {
              signDisplay = "never";
            } else if (this.opts.signMode === "all") {
              signDisplay = "always";
            } else {
              signDisplay = "auto";
            }
            return this.num(lildur.get(mapped) * inversionFactor, token.length, signDisplay);
          } else {
            return token;
          }
        }, tokens = _Formatter.parseFormat(fmt), realTokens = tokens.reduce((found, {
          literal,
          val
        }) => literal ? found : found.concat(val), []), collapsed = dur.shiftTo(...realTokens.map(tokenToField).filter((t) => t)), durationInfo = {
          isNegativeDuration: collapsed < 0,
          // this relies on "collapsed" being based on "shiftTo", which builds up the object
          // in order
          largestUnit: Object.keys(collapsed.values)[0]
        };
        return stringifyTokens(tokens, tokenToString(collapsed, durationInfo));
      }
    };
    var ianaRegex = /[A-Za-z_+-]{1,256}(?::?\/[A-Za-z0-9_+-]{1,256}(?:\/[A-Za-z0-9_+-]{1,256})?)?/;
    function combineRegexes(...regexes) {
      const full = regexes.reduce((f, r) => f + r.source, "");
      return RegExp(`^${full}$`);
    }
    function combineExtractors(...extractors) {
      return (m) => extractors.reduce(([mergedVals, mergedZone, cursor], ex) => {
        const [val, zone, next] = ex(m, cursor);
        return [{
          ...mergedVals,
          ...val
        }, zone || mergedZone, next];
      }, [{}, null, 1]).slice(0, 2);
    }
    function parse(s2, ...patterns) {
      if (s2 == null) {
        return [null, null];
      }
      for (const [regex, extractor] of patterns) {
        const m = regex.exec(s2);
        if (m) {
          return extractor(m);
        }
      }
      return [null, null];
    }
    function simpleParse(...keys) {
      return (match2, cursor) => {
        const ret = {};
        let i;
        for (i = 0; i < keys.length; i++) {
          ret[keys[i]] = parseInteger(match2[cursor + i]);
        }
        return [ret, null, cursor + i];
      };
    }
    var offsetRegex = /(?:([Zz])|([+-]\d\d)(?::?(\d\d))?)/;
    var isoExtendedZone = `(?:${offsetRegex.source}?(?:\\[(${ianaRegex.source})\\])?)?`;
    var isoTimeBaseRegex = /(\d\d)(?::?(\d\d)(?::?(\d\d)(?:[.,](\d{1,30}))?)?)?/;
    var isoTimeRegex = RegExp(`${isoTimeBaseRegex.source}${isoExtendedZone}`);
    var isoTimeExtensionRegex = RegExp(`(?:[Tt]${isoTimeRegex.source})?`);
    var isoYmdRegex = /([+-]\d{6}|\d{4})(?:-?(\d\d)(?:-?(\d\d))?)?/;
    var isoWeekRegex = /(\d{4})-?W(\d\d)(?:-?(\d))?/;
    var isoOrdinalRegex = /(\d{4})-?(\d{3})/;
    var extractISOWeekData = simpleParse("weekYear", "weekNumber", "weekDay");
    var extractISOOrdinalData = simpleParse("year", "ordinal");
    var sqlYmdRegex = /(\d{4})-(\d\d)-(\d\d)/;
    var sqlTimeRegex = RegExp(`${isoTimeBaseRegex.source} ?(?:${offsetRegex.source}|(${ianaRegex.source}))?`);
    var sqlTimeExtensionRegex = RegExp(`(?: ${sqlTimeRegex.source})?`);
    function int2(match2, pos, fallback) {
      const m = match2[pos];
      return isUndefined(m) ? fallback : parseInteger(m);
    }
    function extractISOYmd(match2, cursor) {
      const item = {
        year: int2(match2, cursor),
        month: int2(match2, cursor + 1, 1),
        day: int2(match2, cursor + 2, 1)
      };
      return [item, null, cursor + 3];
    }
    function extractISOTime(match2, cursor) {
      const item = {
        hours: int2(match2, cursor, 0),
        minutes: int2(match2, cursor + 1, 0),
        seconds: int2(match2, cursor + 2, 0),
        milliseconds: parseMillis(match2[cursor + 3])
      };
      return [item, null, cursor + 4];
    }
    function extractISOOffset(match2, cursor) {
      const local = !match2[cursor] && !match2[cursor + 1], fullOffset = signedOffset(match2[cursor + 1], match2[cursor + 2]), zone = local ? null : FixedOffsetZone.instance(fullOffset);
      return [{}, zone, cursor + 3];
    }
    function extractIANAZone(match2, cursor) {
      const zone = match2[cursor] ? IANAZone.create(match2[cursor]) : null;
      return [{}, zone, cursor + 1];
    }
    var isoTimeOnly = RegExp(`^T?${isoTimeBaseRegex.source}$`);
    var isoDuration = /^-?P(?:(?:(-?\d{1,20}(?:\.\d{1,20})?)Y)?(?:(-?\d{1,20}(?:\.\d{1,20})?)M)?(?:(-?\d{1,20}(?:\.\d{1,20})?)W)?(?:(-?\d{1,20}(?:\.\d{1,20})?)D)?(?:T(?:(-?\d{1,20}(?:\.\d{1,20})?)H)?(?:(-?\d{1,20}(?:\.\d{1,20})?)M)?(?:(-?\d{1,20})(?:[.,](-?\d{1,20}))?S)?)?)$/;
    function extractISODuration(match2) {
      const [s2, yearStr, monthStr, weekStr, dayStr, hourStr, minuteStr, secondStr, millisecondsStr] = match2;
      const hasNegativePrefix = s2[0] === "-";
      const negativeSeconds = secondStr && secondStr[0] === "-";
      const maybeNegate = (num, force = false) => num !== void 0 && (force || num && hasNegativePrefix) ? -num : num;
      return [{
        years: maybeNegate(parseFloating(yearStr)),
        months: maybeNegate(parseFloating(monthStr)),
        weeks: maybeNegate(parseFloating(weekStr)),
        days: maybeNegate(parseFloating(dayStr)),
        hours: maybeNegate(parseFloating(hourStr)),
        minutes: maybeNegate(parseFloating(minuteStr)),
        seconds: maybeNegate(parseFloating(secondStr), secondStr === "-0"),
        milliseconds: maybeNegate(parseMillis(millisecondsStr), negativeSeconds)
      }];
    }
    var obsOffsets = {
      GMT: 0,
      EDT: -4 * 60,
      EST: -5 * 60,
      CDT: -5 * 60,
      CST: -6 * 60,
      MDT: -6 * 60,
      MST: -7 * 60,
      PDT: -7 * 60,
      PST: -8 * 60
    };
    function fromStrings(weekdayStr, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr) {
      const result = {
        year: yearStr.length === 2 ? untruncateYear(parseInteger(yearStr)) : parseInteger(yearStr),
        month: monthsShort.indexOf(monthStr) + 1,
        day: parseInteger(dayStr),
        hour: parseInteger(hourStr),
        minute: parseInteger(minuteStr)
      };
      if (secondStr) result.second = parseInteger(secondStr);
      if (weekdayStr) {
        result.weekday = weekdayStr.length > 3 ? weekdaysLong.indexOf(weekdayStr) + 1 : weekdaysShort.indexOf(weekdayStr) + 1;
      }
      return result;
    }
    var rfc2822 = /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s)?(\d{1,2})\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s(\d{2,4})\s(\d\d):(\d\d)(?::(\d\d))?\s(?:(UT|GMT|[ECMP][SD]T)|([Zz])|(?:([+-]\d\d)(\d\d)))$/;
    function extractRFC2822(match2) {
      const [, weekdayStr, dayStr, monthStr, yearStr, hourStr, minuteStr, secondStr, obsOffset, milOffset, offHourStr, offMinuteStr] = match2, result = fromStrings(weekdayStr, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr);
      let offset2;
      if (obsOffset) {
        offset2 = obsOffsets[obsOffset];
      } else if (milOffset) {
        offset2 = 0;
      } else {
        offset2 = signedOffset(offHourStr, offMinuteStr);
      }
      return [result, new FixedOffsetZone(offset2)];
    }
    function preprocessRFC2822(s2) {
      return s2.replace(/\([^()]*\)|[\n\t]/g, " ").replace(/(\s\s+)/g, " ").trim();
    }
    var rfc1123 = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d\d) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d\d):(\d\d):(\d\d) GMT$/;
    var rfc850 = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d\d)-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d\d) (\d\d):(\d\d):(\d\d) GMT$/;
    var ascii = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ( \d|\d\d) (\d\d):(\d\d):(\d\d) (\d{4})$/;
    function extractRFC1123Or850(match2) {
      const [, weekdayStr, dayStr, monthStr, yearStr, hourStr, minuteStr, secondStr] = match2, result = fromStrings(weekdayStr, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr);
      return [result, FixedOffsetZone.utcInstance];
    }
    function extractASCII(match2) {
      const [, weekdayStr, monthStr, dayStr, hourStr, minuteStr, secondStr, yearStr] = match2, result = fromStrings(weekdayStr, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr);
      return [result, FixedOffsetZone.utcInstance];
    }
    var isoYmdWithTimeExtensionRegex = combineRegexes(isoYmdRegex, isoTimeExtensionRegex);
    var isoWeekWithTimeExtensionRegex = combineRegexes(isoWeekRegex, isoTimeExtensionRegex);
    var isoOrdinalWithTimeExtensionRegex = combineRegexes(isoOrdinalRegex, isoTimeExtensionRegex);
    var isoTimeCombinedRegex = combineRegexes(isoTimeRegex);
    var extractISOYmdTimeAndOffset = combineExtractors(extractISOYmd, extractISOTime, extractISOOffset, extractIANAZone);
    var extractISOWeekTimeAndOffset = combineExtractors(extractISOWeekData, extractISOTime, extractISOOffset, extractIANAZone);
    var extractISOOrdinalDateAndTime = combineExtractors(extractISOOrdinalData, extractISOTime, extractISOOffset, extractIANAZone);
    var extractISOTimeAndOffset = combineExtractors(extractISOTime, extractISOOffset, extractIANAZone);
    function parseISODate(s2) {
      return parse(s2, [isoYmdWithTimeExtensionRegex, extractISOYmdTimeAndOffset], [isoWeekWithTimeExtensionRegex, extractISOWeekTimeAndOffset], [isoOrdinalWithTimeExtensionRegex, extractISOOrdinalDateAndTime], [isoTimeCombinedRegex, extractISOTimeAndOffset]);
    }
    function parseRFC2822Date(s2) {
      return parse(preprocessRFC2822(s2), [rfc2822, extractRFC2822]);
    }
    function parseHTTPDate(s2) {
      return parse(s2, [rfc1123, extractRFC1123Or850], [rfc850, extractRFC1123Or850], [ascii, extractASCII]);
    }
    function parseISODuration(s2) {
      return parse(s2, [isoDuration, extractISODuration]);
    }
    var extractISOTimeOnly = combineExtractors(extractISOTime);
    function parseISOTimeOnly(s2) {
      return parse(s2, [isoTimeOnly, extractISOTimeOnly]);
    }
    var sqlYmdWithTimeExtensionRegex = combineRegexes(sqlYmdRegex, sqlTimeExtensionRegex);
    var sqlTimeCombinedRegex = combineRegexes(sqlTimeRegex);
    var extractISOTimeOffsetAndIANAZone = combineExtractors(extractISOTime, extractISOOffset, extractIANAZone);
    function parseSQL(s2) {
      return parse(s2, [sqlYmdWithTimeExtensionRegex, extractISOYmdTimeAndOffset], [sqlTimeCombinedRegex, extractISOTimeOffsetAndIANAZone]);
    }
    var INVALID$2 = "Invalid Duration";
    var lowOrderMatrix = {
      weeks: {
        days: 7,
        hours: 7 * 24,
        minutes: 7 * 24 * 60,
        seconds: 7 * 24 * 60 * 60,
        milliseconds: 7 * 24 * 60 * 60 * 1e3
      },
      days: {
        hours: 24,
        minutes: 24 * 60,
        seconds: 24 * 60 * 60,
        milliseconds: 24 * 60 * 60 * 1e3
      },
      hours: {
        minutes: 60,
        seconds: 60 * 60,
        milliseconds: 60 * 60 * 1e3
      },
      minutes: {
        seconds: 60,
        milliseconds: 60 * 1e3
      },
      seconds: {
        milliseconds: 1e3
      }
    };
    var casualMatrix = {
      years: {
        quarters: 4,
        months: 12,
        weeks: 52,
        days: 365,
        hours: 365 * 24,
        minutes: 365 * 24 * 60,
        seconds: 365 * 24 * 60 * 60,
        milliseconds: 365 * 24 * 60 * 60 * 1e3
      },
      quarters: {
        months: 3,
        weeks: 13,
        days: 91,
        hours: 91 * 24,
        minutes: 91 * 24 * 60,
        seconds: 91 * 24 * 60 * 60,
        milliseconds: 91 * 24 * 60 * 60 * 1e3
      },
      months: {
        weeks: 4,
        days: 30,
        hours: 30 * 24,
        minutes: 30 * 24 * 60,
        seconds: 30 * 24 * 60 * 60,
        milliseconds: 30 * 24 * 60 * 60 * 1e3
      },
      ...lowOrderMatrix
    };
    var daysInYearAccurate = 146097 / 400;
    var daysInMonthAccurate = 146097 / 4800;
    var accurateMatrix = {
      years: {
        quarters: 4,
        months: 12,
        weeks: daysInYearAccurate / 7,
        days: daysInYearAccurate,
        hours: daysInYearAccurate * 24,
        minutes: daysInYearAccurate * 24 * 60,
        seconds: daysInYearAccurate * 24 * 60 * 60,
        milliseconds: daysInYearAccurate * 24 * 60 * 60 * 1e3
      },
      quarters: {
        months: 3,
        weeks: daysInYearAccurate / 28,
        days: daysInYearAccurate / 4,
        hours: daysInYearAccurate * 24 / 4,
        minutes: daysInYearAccurate * 24 * 60 / 4,
        seconds: daysInYearAccurate * 24 * 60 * 60 / 4,
        milliseconds: daysInYearAccurate * 24 * 60 * 60 * 1e3 / 4
      },
      months: {
        weeks: daysInMonthAccurate / 7,
        days: daysInMonthAccurate,
        hours: daysInMonthAccurate * 24,
        minutes: daysInMonthAccurate * 24 * 60,
        seconds: daysInMonthAccurate * 24 * 60 * 60,
        milliseconds: daysInMonthAccurate * 24 * 60 * 60 * 1e3
      },
      ...lowOrderMatrix
    };
    var orderedUnits$1 = ["years", "quarters", "months", "weeks", "days", "hours", "minutes", "seconds", "milliseconds"];
    var reverseUnits = orderedUnits$1.slice(0).reverse();
    function clone$1(dur, alts, clear = false) {
      const conf = {
        values: clear ? alts.values : {
          ...dur.values,
          ...alts.values || {}
        },
        loc: dur.loc.clone(alts.loc),
        conversionAccuracy: alts.conversionAccuracy || dur.conversionAccuracy,
        matrix: alts.matrix || dur.matrix
      };
      return new Duration(conf);
    }
    function durationToMillis(matrix, vals) {
      var _vals$milliseconds;
      let sum = (_vals$milliseconds = vals.milliseconds) != null ? _vals$milliseconds : 0;
      for (const unit of reverseUnits.slice(1)) {
        if (vals[unit]) {
          sum += vals[unit] * matrix[unit]["milliseconds"];
        }
      }
      return sum;
    }
    function normalizeValues(matrix, vals) {
      const factor = durationToMillis(matrix, vals) < 0 ? -1 : 1;
      orderedUnits$1.reduceRight((previous, current) => {
        if (!isUndefined(vals[current])) {
          if (previous) {
            const previousVal = vals[previous] * factor;
            const conv = matrix[current][previous];
            const rollUp = Math.floor(previousVal / conv);
            vals[current] += rollUp * factor;
            vals[previous] -= rollUp * conv * factor;
          }
          return current;
        } else {
          return previous;
        }
      }, null);
      orderedUnits$1.reduce((previous, current) => {
        if (!isUndefined(vals[current])) {
          if (previous) {
            const fraction = vals[previous] % 1;
            vals[previous] -= fraction;
            vals[current] += fraction * matrix[previous][current];
          }
          return current;
        } else {
          return previous;
        }
      }, null);
    }
    function removeZeroes(vals) {
      const newVals = {};
      for (const [key, value] of Object.entries(vals)) {
        if (value !== 0) {
          newVals[key] = value;
        }
      }
      return newVals;
    }
    var Duration = class _Duration {
      /**
       * @private
       */
      constructor(config) {
        const accurate = config.conversionAccuracy === "longterm" || false;
        let matrix = accurate ? accurateMatrix : casualMatrix;
        if (config.matrix) {
          matrix = config.matrix;
        }
        this.values = config.values;
        this.loc = config.loc || Locale.create();
        this.conversionAccuracy = accurate ? "longterm" : "casual";
        this.invalid = config.invalid || null;
        this.matrix = matrix;
        this.isLuxonDuration = true;
      }
      /**
       * Create Duration from a number of milliseconds.
       * @param {number} count of milliseconds
       * @param {Object} opts - options for parsing
       * @param {string} [opts.locale='en-US'] - the locale to use
       * @param {string} opts.numberingSystem - the numbering system to use
       * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
       * @return {Duration}
       */
      static fromMillis(count, opts) {
        return _Duration.fromObject({
          milliseconds: count
        }, opts);
      }
      /**
       * Create a Duration from a JavaScript object with keys like 'years' and 'hours'.
       * If this object is empty then a zero milliseconds duration is returned.
       * @param {Object} obj - the object to create the DateTime from
       * @param {number} obj.years
       * @param {number} obj.quarters
       * @param {number} obj.months
       * @param {number} obj.weeks
       * @param {number} obj.days
       * @param {number} obj.hours
       * @param {number} obj.minutes
       * @param {number} obj.seconds
       * @param {number} obj.milliseconds
       * @param {Object} [opts=[]] - options for creating this Duration
       * @param {string} [opts.locale='en-US'] - the locale to use
       * @param {string} opts.numberingSystem - the numbering system to use
       * @param {string} [opts.conversionAccuracy='casual'] - the preset conversion system to use
       * @param {string} [opts.matrix=Object] - the custom conversion system to use
       * @return {Duration}
       */
      static fromObject(obj, opts = {}) {
        if (obj == null || typeof obj !== "object") {
          throw new InvalidArgumentError(`Duration.fromObject: argument expected to be an object, got ${obj === null ? "null" : typeof obj}`);
        }
        return new _Duration({
          values: normalizeObject(obj, _Duration.normalizeUnit),
          loc: Locale.fromObject(opts),
          conversionAccuracy: opts.conversionAccuracy,
          matrix: opts.matrix
        });
      }
      /**
       * Create a Duration from DurationLike.
       *
       * @param {Object | number | Duration} durationLike
       * One of:
       * - object with keys like 'years' and 'hours'.
       * - number representing milliseconds
       * - Duration instance
       * @return {Duration}
       */
      static fromDurationLike(durationLike) {
        if (isNumber(durationLike)) {
          return _Duration.fromMillis(durationLike);
        } else if (_Duration.isDuration(durationLike)) {
          return durationLike;
        } else if (typeof durationLike === "object") {
          return _Duration.fromObject(durationLike);
        } else {
          throw new InvalidArgumentError(`Unknown duration argument ${durationLike} of type ${typeof durationLike}`);
        }
      }
      /**
       * Create a Duration from an ISO 8601 duration string.
       * @param {string} text - text to parse
       * @param {Object} opts - options for parsing
       * @param {string} [opts.locale='en-US'] - the locale to use
       * @param {string} opts.numberingSystem - the numbering system to use
       * @param {string} [opts.conversionAccuracy='casual'] - the preset conversion system to use
       * @param {string} [opts.matrix=Object] - the preset conversion system to use
       * @see https://en.wikipedia.org/wiki/ISO_8601#Durations
       * @example Duration.fromISO('P3Y6M1W4DT12H30M5S').toObject() //=> { years: 3, months: 6, weeks: 1, days: 4, hours: 12, minutes: 30, seconds: 5 }
       * @example Duration.fromISO('PT23H').toObject() //=> { hours: 23 }
       * @example Duration.fromISO('P5Y3M').toObject() //=> { years: 5, months: 3 }
       * @return {Duration}
       */
      static fromISO(text, opts) {
        const [parsed] = parseISODuration(text);
        if (parsed) {
          return _Duration.fromObject(parsed, opts);
        } else {
          return _Duration.invalid("unparsable", `the input "${text}" can't be parsed as ISO 8601`);
        }
      }
      /**
       * Create a Duration from an ISO 8601 time string.
       * @param {string} text - text to parse
       * @param {Object} opts - options for parsing
       * @param {string} [opts.locale='en-US'] - the locale to use
       * @param {string} opts.numberingSystem - the numbering system to use
       * @param {string} [opts.conversionAccuracy='casual'] - the preset conversion system to use
       * @param {string} [opts.matrix=Object] - the conversion system to use
       * @see https://en.wikipedia.org/wiki/ISO_8601#Times
       * @example Duration.fromISOTime('11:22:33.444').toObject() //=> { hours: 11, minutes: 22, seconds: 33, milliseconds: 444 }
       * @example Duration.fromISOTime('11:00').toObject() //=> { hours: 11, minutes: 0, seconds: 0 }
       * @example Duration.fromISOTime('T11:00').toObject() //=> { hours: 11, minutes: 0, seconds: 0 }
       * @example Duration.fromISOTime('1100').toObject() //=> { hours: 11, minutes: 0, seconds: 0 }
       * @example Duration.fromISOTime('T1100').toObject() //=> { hours: 11, minutes: 0, seconds: 0 }
       * @return {Duration}
       */
      static fromISOTime(text, opts) {
        const [parsed] = parseISOTimeOnly(text);
        if (parsed) {
          return _Duration.fromObject(parsed, opts);
        } else {
          return _Duration.invalid("unparsable", `the input "${text}" can't be parsed as ISO 8601`);
        }
      }
      /**
       * Create an invalid Duration.
       * @param {string} reason - simple string of why this datetime is invalid. Should not contain parameters or anything else data-dependent
       * @param {string} [explanation=null] - longer explanation, may include parameters and other useful debugging information
       * @return {Duration}
       */
      static invalid(reason, explanation = null) {
        if (!reason) {
          throw new InvalidArgumentError("need to specify a reason the Duration is invalid");
        }
        const invalid = reason instanceof Invalid ? reason : new Invalid(reason, explanation);
        if (Settings.throwOnInvalid) {
          throw new InvalidDurationError(invalid);
        } else {
          return new _Duration({
            invalid
          });
        }
      }
      /**
       * @private
       */
      static normalizeUnit(unit) {
        const normalized = {
          year: "years",
          years: "years",
          quarter: "quarters",
          quarters: "quarters",
          month: "months",
          months: "months",
          week: "weeks",
          weeks: "weeks",
          day: "days",
          days: "days",
          hour: "hours",
          hours: "hours",
          minute: "minutes",
          minutes: "minutes",
          second: "seconds",
          seconds: "seconds",
          millisecond: "milliseconds",
          milliseconds: "milliseconds"
        }[unit ? unit.toLowerCase() : unit];
        if (!normalized) throw new InvalidUnitError(unit);
        return normalized;
      }
      /**
       * Check if an object is a Duration. Works across context boundaries
       * @param {object} o
       * @return {boolean}
       */
      static isDuration(o) {
        return o && o.isLuxonDuration || false;
      }
      /**
       * Get  the locale of a Duration, such 'en-GB'
       * @type {string}
       */
      get locale() {
        return this.isValid ? this.loc.locale : null;
      }
      /**
       * Get the numbering system of a Duration, such 'beng'. The numbering system is used when formatting the Duration
       *
       * @type {string}
       */
      get numberingSystem() {
        return this.isValid ? this.loc.numberingSystem : null;
      }
      /**
       * Returns a string representation of this Duration formatted according to the specified format string. You may use these tokens:
       * * `S` for milliseconds
       * * `s` for seconds
       * * `m` for minutes
       * * `h` for hours
       * * `d` for days
       * * `w` for weeks
       * * `M` for months
       * * `y` for years
       * Notes:
       * * Add padding by repeating the token, e.g. "yy" pads the years to two digits, "hhhh" pads the hours out to four digits
       * * Tokens can be escaped by wrapping with single quotes.
       * * The duration will be converted to the set of units in the format string using {@link Duration#shiftTo} and the Durations's conversion accuracy setting.
       * @param {string} fmt - the format string
       * @param {Object} opts - options
       * @param {boolean} [opts.floor=true] - floor numerical values
       * @param {'negative'|'all'|'negativeLargestOnly'} [opts.signMode=negative] - How to handle signs
       * @example Duration.fromObject({ years: 1, days: 6, seconds: 2 }).toFormat("y d s") //=> "1 6 2"
       * @example Duration.fromObject({ years: 1, days: 6, seconds: 2 }).toFormat("yy dd sss") //=> "01 06 002"
       * @example Duration.fromObject({ years: 1, days: 6, seconds: 2 }).toFormat("M S") //=> "12 518402000"
       * @example Duration.fromObject({ days: 6, seconds: 2 }).toFormat("d s", { signMode: "all" }) //=> "+6 +2"
       * @example Duration.fromObject({ days: -6, seconds: -2 }).toFormat("d s", { signMode: "all" }) //=> "-6 -2"
       * @example Duration.fromObject({ days: -6, seconds: -2 }).toFormat("d s", { signMode: "negativeLargestOnly" }) //=> "-6 2"
       * @return {string}
       */
      toFormat(fmt, opts = {}) {
        const fmtOpts = {
          ...opts,
          floor: opts.round !== false && opts.floor !== false
        };
        return this.isValid ? Formatter.create(this.loc, fmtOpts).formatDurationFromString(this, fmt) : INVALID$2;
      }
      /**
       * Returns a string representation of a Duration with all units included.
       * To modify its behavior, use `listStyle` and any Intl.NumberFormat option, though `unitDisplay` is especially relevant.
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat#options
       * @param {Object} opts - Formatting options. Accepts the same keys as the options parameter of the native `Intl.NumberFormat` constructor, as well as `listStyle`.
       * @param {string} [opts.listStyle='narrow'] - How to format the merged list. Corresponds to the `style` property of the options parameter of the native `Intl.ListFormat` constructor.
       * @param {boolean} [opts.showZeros=true] - Show all units previously used by the duration even if they are zero
       * @example
       * ```js
       * var dur = Duration.fromObject({ months: 1, weeks: 0, hours: 5, minutes: 6 })
       * dur.toHuman() //=> '1 month, 0 weeks, 5 hours, 6 minutes'
       * dur.toHuman({ listStyle: "long" }) //=> '1 month, 0 weeks, 5 hours, and 6 minutes'
       * dur.toHuman({ unitDisplay: "short" }) //=> '1 mth, 0 wks, 5 hr, 6 min'
       * dur.toHuman({ showZeros: false }) //=> '1 month, 5 hours, 6 minutes'
       * ```
       */
      toHuman(opts = {}) {
        if (!this.isValid) return INVALID$2;
        const showZeros = opts.showZeros !== false;
        const l2 = orderedUnits$1.map((unit) => {
          const val = this.values[unit];
          if (isUndefined(val) || val === 0 && !showZeros) {
            return null;
          }
          return this.loc.numberFormatter({
            style: "unit",
            unitDisplay: "long",
            ...opts,
            unit: unit.slice(0, -1)
          }).format(val);
        }).filter((n2) => n2);
        return this.loc.listFormatter({
          type: "conjunction",
          style: opts.listStyle || "narrow",
          ...opts
        }).format(l2);
      }
      /**
       * Returns a JavaScript object with this Duration's values.
       * @example Duration.fromObject({ years: 1, days: 6, seconds: 2 }).toObject() //=> { years: 1, days: 6, seconds: 2 }
       * @return {Object}
       */
      toObject() {
        if (!this.isValid) return {};
        return {
          ...this.values
        };
      }
      /**
       * Returns an ISO 8601-compliant string representation of this Duration.
       * @see https://en.wikipedia.org/wiki/ISO_8601#Durations
       * @example Duration.fromObject({ years: 3, seconds: 45 }).toISO() //=> 'P3YT45S'
       * @example Duration.fromObject({ months: 4, seconds: 45 }).toISO() //=> 'P4MT45S'
       * @example Duration.fromObject({ months: 5 }).toISO() //=> 'P5M'
       * @example Duration.fromObject({ minutes: 5 }).toISO() //=> 'PT5M'
       * @example Duration.fromObject({ milliseconds: 6 }).toISO() //=> 'PT0.006S'
       * @return {string}
       */
      toISO() {
        if (!this.isValid) return null;
        let s2 = "P";
        if (this.years !== 0) s2 += this.years + "Y";
        if (this.months !== 0 || this.quarters !== 0) s2 += this.months + this.quarters * 3 + "M";
        if (this.weeks !== 0) s2 += this.weeks + "W";
        if (this.days !== 0) s2 += this.days + "D";
        if (this.hours !== 0 || this.minutes !== 0 || this.seconds !== 0 || this.milliseconds !== 0) s2 += "T";
        if (this.hours !== 0) s2 += this.hours + "H";
        if (this.minutes !== 0) s2 += this.minutes + "M";
        if (this.seconds !== 0 || this.milliseconds !== 0)
          s2 += roundTo(this.seconds + this.milliseconds / 1e3, 3) + "S";
        if (s2 === "P") s2 += "T0S";
        return s2;
      }
      /**
       * Returns an ISO 8601-compliant string representation of this Duration, formatted as a time of day.
       * Note that this will return null if the duration is invalid, negative, or equal to or greater than 24 hours.
       * @see https://en.wikipedia.org/wiki/ISO_8601#Times
       * @param {Object} opts - options
       * @param {boolean} [opts.suppressMilliseconds=false] - exclude milliseconds from the format if they're 0
       * @param {boolean} [opts.suppressSeconds=false] - exclude seconds from the format if they're 0
       * @param {boolean} [opts.includePrefix=false] - include the `T` prefix
       * @param {string} [opts.format='extended'] - choose between the basic and extended format
       * @example Duration.fromObject({ hours: 11 }).toISOTime() //=> '11:00:00.000'
       * @example Duration.fromObject({ hours: 11 }).toISOTime({ suppressMilliseconds: true }) //=> '11:00:00'
       * @example Duration.fromObject({ hours: 11 }).toISOTime({ suppressSeconds: true }) //=> '11:00'
       * @example Duration.fromObject({ hours: 11 }).toISOTime({ includePrefix: true }) //=> 'T11:00:00.000'
       * @example Duration.fromObject({ hours: 11 }).toISOTime({ format: 'basic' }) //=> '110000.000'
       * @return {string}
       */
      toISOTime(opts = {}) {
        if (!this.isValid) return null;
        const millis = this.toMillis();
        if (millis < 0 || millis >= 864e5) return null;
        opts = {
          suppressMilliseconds: false,
          suppressSeconds: false,
          includePrefix: false,
          format: "extended",
          ...opts,
          includeOffset: false
        };
        const dateTime = DateTime.fromMillis(millis, {
          zone: "UTC"
        });
        return dateTime.toISOTime(opts);
      }
      /**
       * Returns an ISO 8601 representation of this Duration appropriate for use in JSON.
       * @return {string}
       */
      toJSON() {
        return this.toISO();
      }
      /**
       * Returns an ISO 8601 representation of this Duration appropriate for use in debugging.
       * @return {string}
       */
      toString() {
        return this.toISO();
      }
      /**
       * Returns a string representation of this Duration appropriate for the REPL.
       * @return {string}
       */
      [Symbol.for("nodejs.util.inspect.custom")]() {
        if (this.isValid) {
          return `Duration { values: ${JSON.stringify(this.values)} }`;
        } else {
          return `Duration { Invalid, reason: ${this.invalidReason} }`;
        }
      }
      /**
       * Returns an milliseconds value of this Duration.
       * @return {number}
       */
      toMillis() {
        if (!this.isValid) return NaN;
        return durationToMillis(this.matrix, this.values);
      }
      /**
       * Returns an milliseconds value of this Duration. Alias of {@link toMillis}
       * @return {number}
       */
      valueOf() {
        return this.toMillis();
      }
      /**
       * Make this Duration longer by the specified amount. Return a newly-constructed Duration.
       * @param {Duration|Object|number} duration - The amount to add. Either a Luxon Duration, a number of milliseconds, the object argument to Duration.fromObject()
       * @return {Duration}
       */
      plus(duration) {
        if (!this.isValid) return this;
        const dur = _Duration.fromDurationLike(duration), result = {};
        for (const k of orderedUnits$1) {
          if (hasOwnProperty(dur.values, k) || hasOwnProperty(this.values, k)) {
            result[k] = dur.get(k) + this.get(k);
          }
        }
        return clone$1(this, {
          values: result
        }, true);
      }
      /**
       * Make this Duration shorter by the specified amount. Return a newly-constructed Duration.
       * @param {Duration|Object|number} duration - The amount to subtract. Either a Luxon Duration, a number of milliseconds, the object argument to Duration.fromObject()
       * @return {Duration}
       */
      minus(duration) {
        if (!this.isValid) return this;
        const dur = _Duration.fromDurationLike(duration);
        return this.plus(dur.negate());
      }
      /**
       * Scale this Duration by the specified amount. Return a newly-constructed Duration.
       * @param {function} fn - The function to apply to each unit. Arity is 1 or 2: the value of the unit and, optionally, the unit name. Must return a number.
       * @example Duration.fromObject({ hours: 1, minutes: 30 }).mapUnits(x => x * 2) //=> { hours: 2, minutes: 60 }
       * @example Duration.fromObject({ hours: 1, minutes: 30 }).mapUnits((x, u) => u === "hours" ? x * 2 : x) //=> { hours: 2, minutes: 30 }
       * @return {Duration}
       */
      mapUnits(fn) {
        if (!this.isValid) return this;
        const result = {};
        for (const k of Object.keys(this.values)) {
          result[k] = asNumber(fn(this.values[k], k));
        }
        return clone$1(this, {
          values: result
        }, true);
      }
      /**
       * Get the value of unit.
       * @param {string} unit - a unit such as 'minute' or 'day'
       * @example Duration.fromObject({years: 2, days: 3}).get('years') //=> 2
       * @example Duration.fromObject({years: 2, days: 3}).get('months') //=> 0
       * @example Duration.fromObject({years: 2, days: 3}).get('days') //=> 3
       * @return {number}
       */
      get(unit) {
        return this[_Duration.normalizeUnit(unit)];
      }
      /**
       * "Set" the values of specified units. Return a newly-constructed Duration.
       * @param {Object} values - a mapping of units to numbers
       * @example dur.set({ years: 2017 })
       * @example dur.set({ hours: 8, minutes: 30 })
       * @return {Duration}
       */
      set(values) {
        if (!this.isValid) return this;
        const mixed = {
          ...this.values,
          ...normalizeObject(values, _Duration.normalizeUnit)
        };
        return clone$1(this, {
          values: mixed
        });
      }
      /**
       * "Set" the locale and/or numberingSystem.  Returns a newly-constructed Duration.
       * @example dur.reconfigure({ locale: 'en-GB' })
       * @return {Duration}
       */
      reconfigure({
        locale,
        numberingSystem,
        conversionAccuracy,
        matrix
      } = {}) {
        const loc = this.loc.clone({
          locale,
          numberingSystem
        });
        const opts = {
          loc,
          matrix,
          conversionAccuracy
        };
        return clone$1(this, opts);
      }
      /**
       * Return the length of the duration in the specified unit.
       * @param {string} unit - a unit such as 'minutes' or 'days'
       * @example Duration.fromObject({years: 1}).as('days') //=> 365
       * @example Duration.fromObject({years: 1}).as('months') //=> 12
       * @example Duration.fromObject({hours: 60}).as('days') //=> 2.5
       * @return {number}
       */
      as(unit) {
        return this.isValid ? this.shiftTo(unit).get(unit) : NaN;
      }
      /**
       * Reduce this Duration to its canonical representation in its current units.
       * Assuming the overall value of the Duration is positive, this means:
       * - excessive values for lower-order units are converted to higher-order units (if possible, see first and second example)
       * - negative lower-order units are converted to higher order units (there must be such a higher order unit, otherwise
       *   the overall value would be negative, see third example)
       * - fractional values for higher-order units are converted to lower-order units (if possible, see fourth example)
       *
       * If the overall value is negative, the result of this method is equivalent to `this.negate().normalize().negate()`.
       * @example Duration.fromObject({ years: 2, days: 5000 }).normalize().toObject() //=> { years: 15, days: 255 }
       * @example Duration.fromObject({ days: 5000 }).normalize().toObject() //=> { days: 5000 }
       * @example Duration.fromObject({ hours: 12, minutes: -45 }).normalize().toObject() //=> { hours: 11, minutes: 15 }
       * @example Duration.fromObject({ years: 2.5, days: 0, hours: 0 }).normalize().toObject() //=> { years: 2, days: 182, hours: 12 }
       * @return {Duration}
       */
      normalize() {
        if (!this.isValid) return this;
        const vals = this.toObject();
        normalizeValues(this.matrix, vals);
        return clone$1(this, {
          values: vals
        }, true);
      }
      /**
       * Rescale units to its largest representation
       * @example Duration.fromObject({ milliseconds: 90000 }).rescale().toObject() //=> { minutes: 1, seconds: 30 }
       * @return {Duration}
       */
      rescale() {
        if (!this.isValid) return this;
        const vals = removeZeroes(this.normalize().shiftToAll().toObject());
        return clone$1(this, {
          values: vals
        }, true);
      }
      /**
       * Convert this Duration into its representation in a different set of units.
       * @example Duration.fromObject({ hours: 1, seconds: 30 }).shiftTo('minutes', 'milliseconds').toObject() //=> { minutes: 60, milliseconds: 30000 }
       * @return {Duration}
       */
      shiftTo(...units) {
        if (!this.isValid) return this;
        if (units.length === 0) {
          return this;
        }
        units = units.map((u) => _Duration.normalizeUnit(u));
        const built = {}, accumulated = {}, vals = this.toObject();
        let lastUnit;
        for (const k of orderedUnits$1) {
          if (units.indexOf(k) >= 0) {
            lastUnit = k;
            let own = 0;
            for (const ak in accumulated) {
              own += this.matrix[ak][k] * accumulated[ak];
              accumulated[ak] = 0;
            }
            if (isNumber(vals[k])) {
              own += vals[k];
            }
            const i = Math.trunc(own);
            built[k] = i;
            accumulated[k] = (own * 1e3 - i * 1e3) / 1e3;
          } else if (isNumber(vals[k])) {
            accumulated[k] = vals[k];
          }
        }
        for (const key in accumulated) {
          if (accumulated[key] !== 0) {
            built[lastUnit] += key === lastUnit ? accumulated[key] : accumulated[key] / this.matrix[lastUnit][key];
          }
        }
        normalizeValues(this.matrix, built);
        return clone$1(this, {
          values: built
        }, true);
      }
      /**
       * Shift this Duration to all available units.
       * Same as shiftTo("years", "months", "weeks", "days", "hours", "minutes", "seconds", "milliseconds")
       * @return {Duration}
       */
      shiftToAll() {
        if (!this.isValid) return this;
        return this.shiftTo("years", "months", "weeks", "days", "hours", "minutes", "seconds", "milliseconds");
      }
      /**
       * Return the negative of this Duration.
       * @example Duration.fromObject({ hours: 1, seconds: 30 }).negate().toObject() //=> { hours: -1, seconds: -30 }
       * @return {Duration}
       */
      negate() {
        if (!this.isValid) return this;
        const negated = {};
        for (const k of Object.keys(this.values)) {
          negated[k] = this.values[k] === 0 ? 0 : -this.values[k];
        }
        return clone$1(this, {
          values: negated
        }, true);
      }
      /**
       * Removes all units with values equal to 0 from this Duration.
       * @example Duration.fromObject({ years: 2, days: 0, hours: 0, minutes: 0 }).removeZeros().toObject() //=> { years: 2 }
       * @return {Duration}
       */
      removeZeros() {
        if (!this.isValid) return this;
        const vals = removeZeroes(this.values);
        return clone$1(this, {
          values: vals
        }, true);
      }
      /**
       * Get the years.
       * @type {number}
       */
      get years() {
        return this.isValid ? this.values.years || 0 : NaN;
      }
      /**
       * Get the quarters.
       * @type {number}
       */
      get quarters() {
        return this.isValid ? this.values.quarters || 0 : NaN;
      }
      /**
       * Get the months.
       * @type {number}
       */
      get months() {
        return this.isValid ? this.values.months || 0 : NaN;
      }
      /**
       * Get the weeks
       * @type {number}
       */
      get weeks() {
        return this.isValid ? this.values.weeks || 0 : NaN;
      }
      /**
       * Get the days.
       * @type {number}
       */
      get days() {
        return this.isValid ? this.values.days || 0 : NaN;
      }
      /**
       * Get the hours.
       * @type {number}
       */
      get hours() {
        return this.isValid ? this.values.hours || 0 : NaN;
      }
      /**
       * Get the minutes.
       * @type {number}
       */
      get minutes() {
        return this.isValid ? this.values.minutes || 0 : NaN;
      }
      /**
       * Get the seconds.
       * @return {number}
       */
      get seconds() {
        return this.isValid ? this.values.seconds || 0 : NaN;
      }
      /**
       * Get the milliseconds.
       * @return {number}
       */
      get milliseconds() {
        return this.isValid ? this.values.milliseconds || 0 : NaN;
      }
      /**
       * Returns whether the Duration is invalid. Invalid durations are returned by diff operations
       * on invalid DateTimes or Intervals.
       * @return {boolean}
       */
      get isValid() {
        return this.invalid === null;
      }
      /**
       * Returns an error code if this Duration became invalid, or null if the Duration is valid
       * @return {string}
       */
      get invalidReason() {
        return this.invalid ? this.invalid.reason : null;
      }
      /**
       * Returns an explanation of why this Duration became invalid, or null if the Duration is valid
       * @type {string}
       */
      get invalidExplanation() {
        return this.invalid ? this.invalid.explanation : null;
      }
      /**
       * Equality check
       * Two Durations are equal iff they have the same units and the same values for each unit.
       * @param {Duration} other
       * @return {boolean}
       */
      equals(other) {
        if (!this.isValid || !other.isValid) {
          return false;
        }
        if (!this.loc.equals(other.loc)) {
          return false;
        }
        function eq(v1, v2) {
          if (v1 === void 0 || v1 === 0) return v2 === void 0 || v2 === 0;
          return v1 === v2;
        }
        for (const u of orderedUnits$1) {
          if (!eq(this.values[u], other.values[u])) {
            return false;
          }
        }
        return true;
      }
    };
    var INVALID$1 = "Invalid Interval";
    function validateStartEnd(start, end) {
      if (!start || !start.isValid) {
        return Interval.invalid("missing or invalid start");
      } else if (!end || !end.isValid) {
        return Interval.invalid("missing or invalid end");
      } else if (end < start) {
        return Interval.invalid("end before start", `The end of an interval must be after its start, but you had start=${start.toISO()} and end=${end.toISO()}`);
      } else {
        return null;
      }
    }
    var Interval = class _Interval {
      /**
       * @private
       */
      constructor(config) {
        this.s = config.start;
        this.e = config.end;
        this.invalid = config.invalid || null;
        this.isLuxonInterval = true;
      }
      /**
       * Create an invalid Interval.
       * @param {string} reason - simple string of why this Interval is invalid. Should not contain parameters or anything else data-dependent
       * @param {string} [explanation=null] - longer explanation, may include parameters and other useful debugging information
       * @return {Interval}
       */
      static invalid(reason, explanation = null) {
        if (!reason) {
          throw new InvalidArgumentError("need to specify a reason the Interval is invalid");
        }
        const invalid = reason instanceof Invalid ? reason : new Invalid(reason, explanation);
        if (Settings.throwOnInvalid) {
          throw new InvalidIntervalError(invalid);
        } else {
          return new _Interval({
            invalid
          });
        }
      }
      /**
       * Create an Interval from a start DateTime and an end DateTime. Inclusive of the start but not the end.
       * @param {DateTime|Date|Object} start
       * @param {DateTime|Date|Object} end
       * @return {Interval}
       */
      static fromDateTimes(start, end) {
        const builtStart = friendlyDateTime(start), builtEnd = friendlyDateTime(end);
        const validateError = validateStartEnd(builtStart, builtEnd);
        if (validateError == null) {
          return new _Interval({
            start: builtStart,
            end: builtEnd
          });
        } else {
          return validateError;
        }
      }
      /**
       * Create an Interval from a start DateTime and a Duration to extend to.
       * @param {DateTime|Date|Object} start
       * @param {Duration|Object|number} duration - the length of the Interval.
       * @return {Interval}
       */
      static after(start, duration) {
        const dur = Duration.fromDurationLike(duration), dt = friendlyDateTime(start);
        return _Interval.fromDateTimes(dt, dt.plus(dur));
      }
      /**
       * Create an Interval from an end DateTime and a Duration to extend backwards to.
       * @param {DateTime|Date|Object} end
       * @param {Duration|Object|number} duration - the length of the Interval.
       * @return {Interval}
       */
      static before(end, duration) {
        const dur = Duration.fromDurationLike(duration), dt = friendlyDateTime(end);
        return _Interval.fromDateTimes(dt.minus(dur), dt);
      }
      /**
       * Create an Interval from an ISO 8601 string.
       * Accepts `<start>/<end>`, `<start>/<duration>`, and `<duration>/<end>` formats.
       * @param {string} text - the ISO string to parse
       * @param {Object} [opts] - options to pass {@link DateTime#fromISO} and optionally {@link Duration#fromISO}
       * @see https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
       * @return {Interval}
       */
      static fromISO(text, opts) {
        const [s2, e] = (text || "").split("/", 2);
        if (s2 && e) {
          let start, startIsValid;
          try {
            start = DateTime.fromISO(s2, opts);
            startIsValid = start.isValid;
          } catch (e2) {
            startIsValid = false;
          }
          let end, endIsValid;
          try {
            end = DateTime.fromISO(e, opts);
            endIsValid = end.isValid;
          } catch (e2) {
            endIsValid = false;
          }
          if (startIsValid && endIsValid) {
            return _Interval.fromDateTimes(start, end);
          }
          if (startIsValid) {
            const dur = Duration.fromISO(e, opts);
            if (dur.isValid) {
              return _Interval.after(start, dur);
            }
          } else if (endIsValid) {
            const dur = Duration.fromISO(s2, opts);
            if (dur.isValid) {
              return _Interval.before(end, dur);
            }
          }
        }
        return _Interval.invalid("unparsable", `the input "${text}" can't be parsed as ISO 8601`);
      }
      /**
       * Check if an object is an Interval. Works across context boundaries
       * @param {object} o
       * @return {boolean}
       */
      static isInterval(o) {
        return o && o.isLuxonInterval || false;
      }
      /**
       * Returns the start of the Interval
       * @type {DateTime}
       */
      get start() {
        return this.isValid ? this.s : null;
      }
      /**
       * Returns the end of the Interval. This is the first instant which is not part of the interval
       * (Interval is half-open).
       * @type {DateTime}
       */
      get end() {
        return this.isValid ? this.e : null;
      }
      /**
       * Returns the last DateTime included in the interval (since end is not part of the interval)
       * @type {DateTime}
       */
      get lastDateTime() {
        return this.isValid ? this.e ? this.e.minus(1) : null : null;
      }
      /**
       * Returns whether this Interval's end is at least its start, meaning that the Interval isn't 'backwards'.
       * @type {boolean}
       */
      get isValid() {
        return this.invalidReason === null;
      }
      /**
       * Returns an error code if this Interval is invalid, or null if the Interval is valid
       * @type {string}
       */
      get invalidReason() {
        return this.invalid ? this.invalid.reason : null;
      }
      /**
       * Returns an explanation of why this Interval became invalid, or null if the Interval is valid
       * @type {string}
       */
      get invalidExplanation() {
        return this.invalid ? this.invalid.explanation : null;
      }
      /**
       * Returns the length of the Interval in the specified unit.
       * @param {string} unit - the unit (such as 'hours' or 'days') to return the length in.
       * @return {number}
       */
      length(unit = "milliseconds") {
        return this.isValid ? this.toDuration(...[unit]).get(unit) : NaN;
      }
      /**
       * Returns the count of minutes, hours, days, months, or years included in the Interval, even in part.
       * Unlike {@link Interval#length} this counts sections of the calendar, not periods of time, e.g. specifying 'day'
       * asks 'what dates are included in this interval?', not 'how many days long is this interval?'
       * @param {string} [unit='milliseconds'] - the unit of time to count.
       * @param {Object} opts - options
       * @param {boolean} [opts.useLocaleWeeks=false] - If true, use weeks based on the locale, i.e. use the locale-dependent start of the week; this operation will always use the locale of the start DateTime
       * @return {number}
       */
      count(unit = "milliseconds", opts) {
        if (!this.isValid) return NaN;
        const start = this.start.startOf(unit, opts);
        let end;
        if (opts != null && opts.useLocaleWeeks) {
          end = this.end.reconfigure({
            locale: start.locale
          });
        } else {
          end = this.end;
        }
        end = end.startOf(unit, opts);
        return Math.floor(end.diff(start, unit).get(unit)) + (end.valueOf() !== this.end.valueOf());
      }
      /**
       * Returns whether this Interval's start and end are both in the same unit of time
       * @param {string} unit - the unit of time to check sameness on
       * @return {boolean}
       */
      hasSame(unit) {
        return this.isValid ? this.isEmpty() || this.e.minus(1).hasSame(this.s, unit) : false;
      }
      /**
       * Return whether this Interval has the same start and end DateTimes.
       * @return {boolean}
       */
      isEmpty() {
        return this.s.valueOf() === this.e.valueOf();
      }
      /**
       * Return whether this Interval's start is after the specified DateTime.
       * @param {DateTime} dateTime
       * @return {boolean}
       */
      isAfter(dateTime) {
        if (!this.isValid) return false;
        return this.s > dateTime;
      }
      /**
       * Return whether this Interval's end is before the specified DateTime.
       * @param {DateTime} dateTime
       * @return {boolean}
       */
      isBefore(dateTime) {
        if (!this.isValid) return false;
        return this.e <= dateTime;
      }
      /**
       * Return whether this Interval contains the specified DateTime.
       * @param {DateTime} dateTime
       * @return {boolean}
       */
      contains(dateTime) {
        if (!this.isValid) return false;
        return this.s <= dateTime && this.e > dateTime;
      }
      /**
       * "Sets" the start and/or end dates. Returns a newly-constructed Interval.
       * @param {Object} values - the values to set
       * @param {DateTime} values.start - the starting DateTime
       * @param {DateTime} values.end - the ending DateTime
       * @return {Interval}
       */
      set({
        start,
        end
      } = {}) {
        if (!this.isValid) return this;
        return _Interval.fromDateTimes(start || this.s, end || this.e);
      }
      /**
       * Split this Interval at each of the specified DateTimes
       * @param {...DateTime} dateTimes - the unit of time to count.
       * @return {Array}
       */
      splitAt(...dateTimes) {
        if (!this.isValid) return [];
        const sorted = dateTimes.map(friendlyDateTime).filter((d) => this.contains(d)).sort((a, b) => a.toMillis() - b.toMillis()), results = [];
        let {
          s: s2
        } = this, i = 0;
        while (s2 < this.e) {
          const added = sorted[i] || this.e, next = +added > +this.e ? this.e : added;
          results.push(_Interval.fromDateTimes(s2, next));
          s2 = next;
          i += 1;
        }
        return results;
      }
      /**
       * Split this Interval into smaller Intervals, each of the specified length.
       * Left over time is grouped into a smaller interval
       * @param {Duration|Object|number} duration - The length of each resulting interval.
       * @return {Array}
       */
      splitBy(duration) {
        const dur = Duration.fromDurationLike(duration);
        if (!this.isValid || !dur.isValid || dur.as("milliseconds") === 0) {
          return [];
        }
        let {
          s: s2
        } = this, idx = 1, next;
        const results = [];
        while (s2 < this.e) {
          const added = this.start.plus(dur.mapUnits((x) => x * idx));
          next = +added > +this.e ? this.e : added;
          results.push(_Interval.fromDateTimes(s2, next));
          s2 = next;
          idx += 1;
        }
        return results;
      }
      /**
       * Split this Interval into the specified number of smaller intervals.
       * @param {number} numberOfParts - The number of Intervals to divide the Interval into.
       * @return {Array}
       */
      divideEqually(numberOfParts) {
        if (!this.isValid) return [];
        return this.splitBy(this.length() / numberOfParts).slice(0, numberOfParts);
      }
      /**
       * Return whether this Interval overlaps with the specified Interval
       * @param {Interval} other
       * @return {boolean}
       */
      overlaps(other) {
        return this.e > other.s && this.s < other.e;
      }
      /**
       * Return whether this Interval's end is adjacent to the specified Interval's start.
       * @param {Interval} other
       * @return {boolean}
       */
      abutsStart(other) {
        if (!this.isValid) return false;
        return +this.e === +other.s;
      }
      /**
       * Return whether this Interval's start is adjacent to the specified Interval's end.
       * @param {Interval} other
       * @return {boolean}
       */
      abutsEnd(other) {
        if (!this.isValid) return false;
        return +other.e === +this.s;
      }
      /**
       * Returns true if this Interval fully contains the specified Interval, specifically if the intersect (of this Interval and the other Interval) is equal to the other Interval; false otherwise.
       * @param {Interval} other
       * @return {boolean}
       */
      engulfs(other) {
        if (!this.isValid) return false;
        return this.s <= other.s && this.e >= other.e;
      }
      /**
       * Return whether this Interval has the same start and end as the specified Interval.
       * @param {Interval} other
       * @return {boolean}
       */
      equals(other) {
        if (!this.isValid || !other.isValid) {
          return false;
        }
        return this.s.equals(other.s) && this.e.equals(other.e);
      }
      /**
       * Return an Interval representing the intersection of this Interval and the specified Interval.
       * Specifically, the resulting Interval has the maximum start time and the minimum end time of the two Intervals.
       * Returns null if the intersection is empty, meaning, the intervals don't intersect.
       * @param {Interval} other
       * @return {Interval}
       */
      intersection(other) {
        if (!this.isValid) return this;
        const s2 = this.s > other.s ? this.s : other.s, e = this.e < other.e ? this.e : other.e;
        if (s2 >= e) {
          return null;
        } else {
          return _Interval.fromDateTimes(s2, e);
        }
      }
      /**
       * Return an Interval representing the union of this Interval and the specified Interval.
       * Specifically, the resulting Interval has the minimum start time and the maximum end time of the two Intervals.
       * @param {Interval} other
       * @return {Interval}
       */
      union(other) {
        if (!this.isValid) return this;
        const s2 = this.s < other.s ? this.s : other.s, e = this.e > other.e ? this.e : other.e;
        return _Interval.fromDateTimes(s2, e);
      }
      /**
       * Merge an array of Intervals into an equivalent minimal set of Intervals.
       * Combines overlapping and adjacent Intervals.
       * The resulting array will contain the Intervals in ascending order, that is, starting with the earliest Interval
       * and ending with the latest.
       *
       * @param {Array} intervals
       * @return {Array}
       */
      static merge(intervals) {
        const [found, final] = intervals.sort((a, b) => a.s - b.s).reduce(([sofar, current], item) => {
          if (!current) {
            return [sofar, item];
          } else if (current.overlaps(item) || current.abutsStart(item)) {
            return [sofar, current.union(item)];
          } else {
            return [sofar.concat([current]), item];
          }
        }, [[], null]);
        if (final) {
          found.push(final);
        }
        return found;
      }
      /**
       * Return an array of Intervals representing the spans of time that only appear in one of the specified Intervals.
       * @param {Array} intervals
       * @return {Array}
       */
      static xor(intervals) {
        let start = null, currentCount = 0;
        const results = [], ends = intervals.map((i) => [{
          time: i.s,
          type: "s"
        }, {
          time: i.e,
          type: "e"
        }]), flattened = Array.prototype.concat(...ends), arr = flattened.sort((a, b) => a.time - b.time);
        for (const i of arr) {
          currentCount += i.type === "s" ? 1 : -1;
          if (currentCount === 1) {
            start = i.time;
          } else {
            if (start && +start !== +i.time) {
              results.push(_Interval.fromDateTimes(start, i.time));
            }
            start = null;
          }
        }
        return _Interval.merge(results);
      }
      /**
       * Return an Interval representing the span of time in this Interval that doesn't overlap with any of the specified Intervals.
       * @param {...Interval} intervals
       * @return {Array}
       */
      difference(...intervals) {
        return _Interval.xor([this].concat(intervals)).map((i) => this.intersection(i)).filter((i) => i && !i.isEmpty());
      }
      /**
       * Returns a string representation of this Interval appropriate for debugging.
       * @return {string}
       */
      toString() {
        if (!this.isValid) return INVALID$1;
        return `[${this.s.toISO()} \u2013 ${this.e.toISO()})`;
      }
      /**
       * Returns a string representation of this Interval appropriate for the REPL.
       * @return {string}
       */
      [Symbol.for("nodejs.util.inspect.custom")]() {
        if (this.isValid) {
          return `Interval { start: ${this.s.toISO()}, end: ${this.e.toISO()} }`;
        } else {
          return `Interval { Invalid, reason: ${this.invalidReason} }`;
        }
      }
      /**
       * Returns a localized string representing this Interval. Accepts the same options as the
       * Intl.DateTimeFormat constructor and any presets defined by Luxon, such as
       * {@link DateTime.DATE_FULL} or {@link DateTime.TIME_SIMPLE}. The exact behavior of this method
       * is browser-specific, but in general it will return an appropriate representation of the
       * Interval in the assigned locale. Defaults to the system's locale if no locale has been
       * specified.
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
       * @param {Object} [formatOpts=DateTime.DATE_SHORT] - Either a DateTime preset or
       * Intl.DateTimeFormat constructor options.
       * @param {Object} opts - Options to override the configuration of the start DateTime.
       * @example Interval.fromISO('2022-11-07T09:00Z/2022-11-08T09:00Z').toLocaleString(); //=> 11/7/2022 – 11/8/2022
       * @example Interval.fromISO('2022-11-07T09:00Z/2022-11-08T09:00Z').toLocaleString(DateTime.DATE_FULL); //=> November 7 – 8, 2022
       * @example Interval.fromISO('2022-11-07T09:00Z/2022-11-08T09:00Z').toLocaleString(DateTime.DATE_FULL, { locale: 'fr-FR' }); //=> 7–8 novembre 2022
       * @example Interval.fromISO('2022-11-07T17:00Z/2022-11-07T19:00Z').toLocaleString(DateTime.TIME_SIMPLE); //=> 6:00 – 8:00 PM
       * @example Interval.fromISO('2022-11-07T17:00Z/2022-11-07T19:00Z').toLocaleString({ weekday: 'short', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }); //=> Mon, Nov 07, 6:00 – 8:00 p
       * @return {string}
       */
      toLocaleString(formatOpts = DATE_SHORT, opts = {}) {
        return this.isValid ? Formatter.create(this.s.loc.clone(opts), formatOpts).formatInterval(this) : INVALID$1;
      }
      /**
       * Returns an ISO 8601-compliant string representation of this Interval.
       * @see https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
       * @param {Object} opts - The same options as {@link DateTime#toISO}
       * @return {string}
       */
      toISO(opts) {
        if (!this.isValid) return INVALID$1;
        return `${this.s.toISO(opts)}/${this.e.toISO(opts)}`;
      }
      /**
       * Returns an ISO 8601-compliant string representation of date of this Interval.
       * The time components are ignored.
       * @see https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
       * @return {string}
       */
      toISODate() {
        if (!this.isValid) return INVALID$1;
        return `${this.s.toISODate()}/${this.e.toISODate()}`;
      }
      /**
       * Returns an ISO 8601-compliant string representation of time of this Interval.
       * The date components are ignored.
       * @see https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
       * @param {Object} opts - The same options as {@link DateTime#toISO}
       * @return {string}
       */
      toISOTime(opts) {
        if (!this.isValid) return INVALID$1;
        return `${this.s.toISOTime(opts)}/${this.e.toISOTime(opts)}`;
      }
      /**
       * Returns a string representation of this Interval formatted according to the specified format
       * string. **You may not want this.** See {@link Interval#toLocaleString} for a more flexible
       * formatting tool.
       * @param {string} dateFormat - The format string. This string formats the start and end time.
       * See {@link DateTime#toFormat} for details.
       * @param {Object} opts - Options.
       * @param {string} [opts.separator =  ' – '] - A separator to place between the start and end
       * representations.
       * @return {string}
       */
      toFormat(dateFormat, {
        separator = " \u2013 "
      } = {}) {
        if (!this.isValid) return INVALID$1;
        return `${this.s.toFormat(dateFormat)}${separator}${this.e.toFormat(dateFormat)}`;
      }
      /**
       * Return a Duration representing the time spanned by this interval.
       * @param {string|string[]} [unit=['milliseconds']] - the unit or units (such as 'hours' or 'days') to include in the duration.
       * @param {Object} opts - options that affect the creation of the Duration
       * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
       * @example Interval.fromDateTimes(dt1, dt2).toDuration().toObject() //=> { milliseconds: 88489257 }
       * @example Interval.fromDateTimes(dt1, dt2).toDuration('days').toObject() //=> { days: 1.0241812152777778 }
       * @example Interval.fromDateTimes(dt1, dt2).toDuration(['hours', 'minutes']).toObject() //=> { hours: 24, minutes: 34.82095 }
       * @example Interval.fromDateTimes(dt1, dt2).toDuration(['hours', 'minutes', 'seconds']).toObject() //=> { hours: 24, minutes: 34, seconds: 49.257 }
       * @example Interval.fromDateTimes(dt1, dt2).toDuration('seconds').toObject() //=> { seconds: 88489.257 }
       * @return {Duration}
       */
      toDuration(unit, opts) {
        if (!this.isValid) {
          return Duration.invalid(this.invalidReason);
        }
        return this.e.diff(this.s, unit, opts);
      }
      /**
       * Run mapFn on the interval start and end, returning a new Interval from the resulting DateTimes
       * @param {function} mapFn
       * @return {Interval}
       * @example Interval.fromDateTimes(dt1, dt2).mapEndpoints(endpoint => endpoint.toUTC())
       * @example Interval.fromDateTimes(dt1, dt2).mapEndpoints(endpoint => endpoint.plus({ hours: 2 }))
       */
      mapEndpoints(mapFn) {
        return _Interval.fromDateTimes(mapFn(this.s), mapFn(this.e));
      }
    };
    var Info = class {
      /**
       * Return whether the specified zone contains a DST.
       * @param {string|Zone} [zone='local'] - Zone to check. Defaults to the environment's local zone.
       * @return {boolean}
       */
      static hasDST(zone = Settings.defaultZone) {
        const proto = DateTime.now().setZone(zone).set({
          month: 12
        });
        return !zone.isUniversal && proto.offset !== proto.set({
          month: 6
        }).offset;
      }
      /**
       * Return whether the specified zone is a valid IANA specifier.
       * @param {string} zone - Zone to check
       * @return {boolean}
       */
      static isValidIANAZone(zone) {
        return IANAZone.isValidZone(zone);
      }
      /**
       * Converts the input into a {@link Zone} instance.
       *
       * * If `input` is already a Zone instance, it is returned unchanged.
       * * If `input` is a string containing a valid time zone name, a Zone instance
       *   with that name is returned.
       * * If `input` is a string that doesn't refer to a known time zone, a Zone
       *   instance with {@link Zone#isValid} == false is returned.
       * * If `input is a number, a Zone instance with the specified fixed offset
       *   in minutes is returned.
       * * If `input` is `null` or `undefined`, the default zone is returned.
       * @param {string|Zone|number} [input] - the value to be converted
       * @return {Zone}
       */
      static normalizeZone(input) {
        return normalizeZone(input, Settings.defaultZone);
      }
      /**
       * Get the weekday on which the week starts according to the given locale.
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @param {string} [opts.locObj=null] - an existing locale object to use
       * @returns {number} the start of the week, 1 for Monday through 7 for Sunday
       */
      static getStartOfWeek({
        locale = null,
        locObj = null
      } = {}) {
        return (locObj || Locale.create(locale)).getStartOfWeek();
      }
      /**
       * Get the minimum number of days necessary in a week before it is considered part of the next year according
       * to the given locale.
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @param {string} [opts.locObj=null] - an existing locale object to use
       * @returns {number}
       */
      static getMinimumDaysInFirstWeek({
        locale = null,
        locObj = null
      } = {}) {
        return (locObj || Locale.create(locale)).getMinDaysInFirstWeek();
      }
      /**
       * Get the weekdays, which are considered the weekend according to the given locale
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @param {string} [opts.locObj=null] - an existing locale object to use
       * @returns {number[]} an array of weekdays, 1 for Monday through 7 for Sunday
       */
      static getWeekendWeekdays({
        locale = null,
        locObj = null
      } = {}) {
        return (locObj || Locale.create(locale)).getWeekendDays().slice();
      }
      /**
       * Return an array of standalone month names.
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
       * @param {string} [length='long'] - the length of the month representation, such as "numeric", "2-digit", "narrow", "short", "long"
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @param {string} [opts.numberingSystem=null] - the numbering system
       * @param {string} [opts.locObj=null] - an existing locale object to use
       * @param {string} [opts.outputCalendar='gregory'] - the calendar
       * @example Info.months()[0] //=> 'January'
       * @example Info.months('short')[0] //=> 'Jan'
       * @example Info.months('numeric')[0] //=> '1'
       * @example Info.months('short', { locale: 'fr-CA' } )[0] //=> 'janv.'
       * @example Info.months('numeric', { locale: 'ar' })[0] //=> '١'
       * @example Info.months('long', { outputCalendar: 'islamic' })[0] //=> 'Rabiʻ I'
       * @return {Array}
       */
      static months(length = "long", {
        locale = null,
        numberingSystem = null,
        locObj = null,
        outputCalendar = "gregory"
      } = {}) {
        return (locObj || Locale.create(locale, numberingSystem, outputCalendar)).months(length);
      }
      /**
       * Return an array of format month names.
       * Format months differ from standalone months in that they're meant to appear next to the day of the month. In some languages, that
       * changes the string.
       * See {@link Info#months}
       * @param {string} [length='long'] - the length of the month representation, such as "numeric", "2-digit", "narrow", "short", "long"
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @param {string} [opts.numberingSystem=null] - the numbering system
       * @param {string} [opts.locObj=null] - an existing locale object to use
       * @param {string} [opts.outputCalendar='gregory'] - the calendar
       * @return {Array}
       */
      static monthsFormat(length = "long", {
        locale = null,
        numberingSystem = null,
        locObj = null,
        outputCalendar = "gregory"
      } = {}) {
        return (locObj || Locale.create(locale, numberingSystem, outputCalendar)).months(length, true);
      }
      /**
       * Return an array of standalone week names.
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
       * @param {string} [length='long'] - the length of the weekday representation, such as "narrow", "short", "long".
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @param {string} [opts.numberingSystem=null] - the numbering system
       * @param {string} [opts.locObj=null] - an existing locale object to use
       * @example Info.weekdays()[0] //=> 'Monday'
       * @example Info.weekdays('short')[0] //=> 'Mon'
       * @example Info.weekdays('short', { locale: 'fr-CA' })[0] //=> 'lun.'
       * @example Info.weekdays('short', { locale: 'ar' })[0] //=> 'الاثنين'
       * @return {Array}
       */
      static weekdays(length = "long", {
        locale = null,
        numberingSystem = null,
        locObj = null
      } = {}) {
        return (locObj || Locale.create(locale, numberingSystem, null)).weekdays(length);
      }
      /**
       * Return an array of format week names.
       * Format weekdays differ from standalone weekdays in that they're meant to appear next to more date information. In some languages, that
       * changes the string.
       * See {@link Info#weekdays}
       * @param {string} [length='long'] - the length of the month representation, such as "narrow", "short", "long".
       * @param {Object} opts - options
       * @param {string} [opts.locale=null] - the locale code
       * @param {string} [opts.numberingSystem=null] - the numbering system
       * @param {string} [opts.locObj=null] - an existing locale object to use
       * @return {Array}
       */
      static weekdaysFormat(length = "long", {
        locale = null,
        numberingSystem = null,
        locObj = null
      } = {}) {
        return (locObj || Locale.create(locale, numberingSystem, null)).weekdays(length, true);
      }
      /**
       * Return an array of meridiems.
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @example Info.meridiems() //=> [ 'AM', 'PM' ]
       * @example Info.meridiems({ locale: 'my' }) //=> [ 'နံနက်', 'ညနေ' ]
       * @return {Array}
       */
      static meridiems({
        locale = null
      } = {}) {
        return Locale.create(locale).meridiems();
      }
      /**
       * Return an array of eras, such as ['BC', 'AD']. The locale can be specified, but the calendar system is always Gregorian.
       * @param {string} [length='short'] - the length of the era representation, such as "short" or "long".
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @example Info.eras() //=> [ 'BC', 'AD' ]
       * @example Info.eras('long') //=> [ 'Before Christ', 'Anno Domini' ]
       * @example Info.eras('long', { locale: 'fr' }) //=> [ 'avant Jésus-Christ', 'après Jésus-Christ' ]
       * @return {Array}
       */
      static eras(length = "short", {
        locale = null
      } = {}) {
        return Locale.create(locale, null, "gregory").eras(length);
      }
      /**
       * Return the set of available features in this environment.
       * Some features of Luxon are not available in all environments. For example, on older browsers, relative time formatting support is not available. Use this function to figure out if that's the case.
       * Keys:
       * * `relative`: whether this environment supports relative time formatting
       * * `localeWeek`: whether this environment supports different weekdays for the start of the week based on the locale
       * @example Info.features() //=> { relative: false, localeWeek: true }
       * @return {Object}
       */
      static features() {
        return {
          relative: hasRelative(),
          localeWeek: hasLocaleWeekInfo()
        };
      }
    };
    function dayDiff(earlier, later) {
      const utcDayStart = (dt) => dt.toUTC(0, {
        keepLocalTime: true
      }).startOf("day").valueOf(), ms = utcDayStart(later) - utcDayStart(earlier);
      return Math.floor(Duration.fromMillis(ms).as("days"));
    }
    function highOrderDiffs(cursor, later, units) {
      const differs = [["years", (a, b) => b.year - a.year], ["quarters", (a, b) => b.quarter - a.quarter + (b.year - a.year) * 4], ["months", (a, b) => b.month - a.month + (b.year - a.year) * 12], ["weeks", (a, b) => {
        const days = dayDiff(a, b);
        return (days - days % 7) / 7;
      }], ["days", dayDiff]];
      const results = {};
      const earlier = cursor;
      let lowestOrder, highWater;
      for (const [unit, differ] of differs) {
        if (units.indexOf(unit) >= 0) {
          lowestOrder = unit;
          results[unit] = differ(cursor, later);
          highWater = earlier.plus(results);
          if (highWater > later) {
            results[unit]--;
            cursor = earlier.plus(results);
            if (cursor > later) {
              highWater = cursor;
              results[unit]--;
              cursor = earlier.plus(results);
            }
          } else {
            cursor = highWater;
          }
        }
      }
      return [cursor, results, highWater, lowestOrder];
    }
    function diff(earlier, later, units, opts) {
      let [cursor, results, highWater, lowestOrder] = highOrderDiffs(earlier, later, units);
      const remainingMillis = later - cursor;
      const lowerOrderUnits = units.filter((u) => ["hours", "minutes", "seconds", "milliseconds"].indexOf(u) >= 0);
      if (lowerOrderUnits.length === 0) {
        if (highWater < later) {
          highWater = cursor.plus({
            [lowestOrder]: 1
          });
        }
        if (highWater !== cursor) {
          results[lowestOrder] = (results[lowestOrder] || 0) + remainingMillis / (highWater - cursor);
        }
      }
      const duration = Duration.fromObject(results, opts);
      if (lowerOrderUnits.length > 0) {
        return Duration.fromMillis(remainingMillis, opts).shiftTo(...lowerOrderUnits).plus(duration);
      } else {
        return duration;
      }
    }
    var MISSING_FTP = "missing Intl.DateTimeFormat.formatToParts support";
    function intUnit(regex, post = (i) => i) {
      return {
        regex,
        deser: ([s2]) => post(parseDigits(s2))
      };
    }
    var NBSP = String.fromCharCode(160);
    var spaceOrNBSP = `[ ${NBSP}]`;
    var spaceOrNBSPRegExp = new RegExp(spaceOrNBSP, "g");
    function fixListRegex(s2) {
      return s2.replace(/\./g, "\\.?").replace(spaceOrNBSPRegExp, spaceOrNBSP);
    }
    function stripInsensitivities(s2) {
      return s2.replace(/\./g, "").replace(spaceOrNBSPRegExp, " ").toLowerCase();
    }
    function oneOf(strings, startIndex) {
      if (strings === null) {
        return null;
      } else {
        return {
          regex: RegExp(strings.map(fixListRegex).join("|")),
          deser: ([s2]) => strings.findIndex((i) => stripInsensitivities(s2) === stripInsensitivities(i)) + startIndex
        };
      }
    }
    function offset(regex, groups) {
      return {
        regex,
        deser: ([, h, m]) => signedOffset(h, m),
        groups
      };
    }
    function simple(regex) {
      return {
        regex,
        deser: ([s2]) => s2
      };
    }
    function escapeToken(value) {
      return value.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
    }
    function unitForToken(token, loc) {
      const one = digitRegex(loc), two = digitRegex(loc, "{2}"), three = digitRegex(loc, "{3}"), four = digitRegex(loc, "{4}"), six = digitRegex(loc, "{6}"), oneOrTwo = digitRegex(loc, "{1,2}"), oneToThree = digitRegex(loc, "{1,3}"), oneToSix = digitRegex(loc, "{1,6}"), oneToNine = digitRegex(loc, "{1,9}"), twoToFour = digitRegex(loc, "{2,4}"), fourToSix = digitRegex(loc, "{4,6}"), literal = (t) => ({
        regex: RegExp(escapeToken(t.val)),
        deser: ([s2]) => s2,
        literal: true
      }), unitate = (t) => {
        if (token.literal) {
          return literal(t);
        }
        switch (t.val) {
          // era
          case "G":
            return oneOf(loc.eras("short"), 0);
          case "GG":
            return oneOf(loc.eras("long"), 0);
          // years
          case "y":
            return intUnit(oneToSix);
          case "yy":
            return intUnit(twoToFour, untruncateYear);
          case "yyyy":
            return intUnit(four);
          case "yyyyy":
            return intUnit(fourToSix);
          case "yyyyyy":
            return intUnit(six);
          // months
          case "M":
            return intUnit(oneOrTwo);
          case "MM":
            return intUnit(two);
          case "MMM":
            return oneOf(loc.months("short", true), 1);
          case "MMMM":
            return oneOf(loc.months("long", true), 1);
          case "L":
            return intUnit(oneOrTwo);
          case "LL":
            return intUnit(two);
          case "LLL":
            return oneOf(loc.months("short", false), 1);
          case "LLLL":
            return oneOf(loc.months("long", false), 1);
          // dates
          case "d":
            return intUnit(oneOrTwo);
          case "dd":
            return intUnit(two);
          // ordinals
          case "o":
            return intUnit(oneToThree);
          case "ooo":
            return intUnit(three);
          // time
          case "HH":
            return intUnit(two);
          case "H":
            return intUnit(oneOrTwo);
          case "hh":
            return intUnit(two);
          case "h":
            return intUnit(oneOrTwo);
          case "mm":
            return intUnit(two);
          case "m":
            return intUnit(oneOrTwo);
          case "q":
            return intUnit(oneOrTwo);
          case "qq":
            return intUnit(two);
          case "s":
            return intUnit(oneOrTwo);
          case "ss":
            return intUnit(two);
          case "S":
            return intUnit(oneToThree);
          case "SSS":
            return intUnit(three);
          case "u":
            return simple(oneToNine);
          case "uu":
            return simple(oneOrTwo);
          case "uuu":
            return intUnit(one);
          // meridiem
          case "a":
            return oneOf(loc.meridiems(), 0);
          // weekYear (k)
          case "kkkk":
            return intUnit(four);
          case "kk":
            return intUnit(twoToFour, untruncateYear);
          // weekNumber (W)
          case "W":
            return intUnit(oneOrTwo);
          case "WW":
            return intUnit(two);
          // weekdays
          case "E":
          case "c":
            return intUnit(one);
          case "EEE":
            return oneOf(loc.weekdays("short", false), 1);
          case "EEEE":
            return oneOf(loc.weekdays("long", false), 1);
          case "ccc":
            return oneOf(loc.weekdays("short", true), 1);
          case "cccc":
            return oneOf(loc.weekdays("long", true), 1);
          // offset/zone
          case "Z":
          case "ZZ":
            return offset(new RegExp(`([+-]${oneOrTwo.source})(?::(${two.source}))?`), 2);
          case "ZZZ":
            return offset(new RegExp(`([+-]${oneOrTwo.source})(${two.source})?`), 2);
          // we don't support ZZZZ (PST) or ZZZZZ (Pacific Standard Time) in parsing
          // because we don't have any way to figure out what they are
          case "z":
            return simple(/[a-z_+-/]{1,256}?/i);
          // this special-case "token" represents a place where a macro-token expanded into a white-space literal
          // in this case we accept any non-newline white-space
          case " ":
            return simple(/[^\S\n\r]/);
          default:
            return literal(t);
        }
      };
      const unit = unitate(token) || {
        invalidReason: MISSING_FTP
      };
      unit.token = token;
      return unit;
    }
    var partTypeStyleToTokenVal = {
      year: {
        "2-digit": "yy",
        numeric: "yyyyy"
      },
      month: {
        numeric: "M",
        "2-digit": "MM",
        short: "MMM",
        long: "MMMM"
      },
      day: {
        numeric: "d",
        "2-digit": "dd"
      },
      weekday: {
        short: "EEE",
        long: "EEEE"
      },
      dayperiod: "a",
      dayPeriod: "a",
      hour12: {
        numeric: "h",
        "2-digit": "hh"
      },
      hour24: {
        numeric: "H",
        "2-digit": "HH"
      },
      minute: {
        numeric: "m",
        "2-digit": "mm"
      },
      second: {
        numeric: "s",
        "2-digit": "ss"
      },
      timeZoneName: {
        long: "ZZZZZ",
        short: "ZZZ"
      }
    };
    function tokenForPart(part, formatOpts, resolvedOpts) {
      const {
        type: type2,
        value
      } = part;
      if (type2 === "literal") {
        const isSpace = /^\s+$/.test(value);
        return {
          literal: !isSpace,
          val: isSpace ? " " : value
        };
      }
      const style = formatOpts[type2];
      let actualType = type2;
      if (type2 === "hour") {
        if (formatOpts.hour12 != null) {
          actualType = formatOpts.hour12 ? "hour12" : "hour24";
        } else if (formatOpts.hourCycle != null) {
          if (formatOpts.hourCycle === "h11" || formatOpts.hourCycle === "h12") {
            actualType = "hour12";
          } else {
            actualType = "hour24";
          }
        } else {
          actualType = resolvedOpts.hour12 ? "hour12" : "hour24";
        }
      }
      let val = partTypeStyleToTokenVal[actualType];
      if (typeof val === "object") {
        val = val[style];
      }
      if (val) {
        return {
          literal: false,
          val
        };
      }
      return void 0;
    }
    function buildRegex(units) {
      const re = units.map((u) => u.regex).reduce((f, r) => `${f}(${r.source})`, "");
      return [`^${re}$`, units];
    }
    function match(input, regex, handlers) {
      const matches = input.match(regex);
      if (matches) {
        const all = {};
        let matchIndex = 1;
        for (const i in handlers) {
          if (hasOwnProperty(handlers, i)) {
            const h = handlers[i], groups = h.groups ? h.groups + 1 : 1;
            if (!h.literal && h.token) {
              all[h.token.val[0]] = h.deser(matches.slice(matchIndex, matchIndex + groups));
            }
            matchIndex += groups;
          }
        }
        return [matches, all];
      } else {
        return [matches, {}];
      }
    }
    function dateTimeFromMatches(matches) {
      const toField = (token) => {
        switch (token) {
          case "S":
            return "millisecond";
          case "s":
            return "second";
          case "m":
            return "minute";
          case "h":
          case "H":
            return "hour";
          case "d":
            return "day";
          case "o":
            return "ordinal";
          case "L":
          case "M":
            return "month";
          case "y":
            return "year";
          case "E":
          case "c":
            return "weekday";
          case "W":
            return "weekNumber";
          case "k":
            return "weekYear";
          case "q":
            return "quarter";
          default:
            return null;
        }
      };
      let zone = null;
      let specificOffset;
      if (!isUndefined(matches.z)) {
        zone = IANAZone.create(matches.z);
      }
      if (!isUndefined(matches.Z)) {
        if (!zone) {
          zone = new FixedOffsetZone(matches.Z);
        }
        specificOffset = matches.Z;
      }
      if (!isUndefined(matches.q)) {
        matches.M = (matches.q - 1) * 3 + 1;
      }
      if (!isUndefined(matches.h)) {
        if (matches.h < 12 && matches.a === 1) {
          matches.h += 12;
        } else if (matches.h === 12 && matches.a === 0) {
          matches.h = 0;
        }
      }
      if (matches.G === 0 && matches.y) {
        matches.y = -matches.y;
      }
      if (!isUndefined(matches.u)) {
        matches.S = parseMillis(matches.u);
      }
      const vals = Object.keys(matches).reduce((r, k) => {
        const f = toField(k);
        if (f) {
          r[f] = matches[k];
        }
        return r;
      }, {});
      return [vals, zone, specificOffset];
    }
    var dummyDateTimeCache = null;
    function getDummyDateTime() {
      if (!dummyDateTimeCache) {
        dummyDateTimeCache = DateTime.fromMillis(1555555555555);
      }
      return dummyDateTimeCache;
    }
    function maybeExpandMacroToken(token, locale) {
      if (token.literal) {
        return token;
      }
      const formatOpts = Formatter.macroTokenToFormatOpts(token.val);
      const tokens = formatOptsToTokens(formatOpts, locale);
      if (tokens == null || tokens.includes(void 0)) {
        return token;
      }
      return tokens;
    }
    function expandMacroTokens(tokens, locale) {
      return Array.prototype.concat(...tokens.map((t) => maybeExpandMacroToken(t, locale)));
    }
    var TokenParser = class {
      constructor(locale, format) {
        this.locale = locale;
        this.format = format;
        this.tokens = expandMacroTokens(Formatter.parseFormat(format), locale);
        this.units = this.tokens.map((t) => unitForToken(t, locale));
        this.disqualifyingUnit = this.units.find((t) => t.invalidReason);
        if (!this.disqualifyingUnit) {
          const [regexString, handlers] = buildRegex(this.units);
          this.regex = RegExp(regexString, "i");
          this.handlers = handlers;
        }
      }
      explainFromTokens(input) {
        if (!this.isValid) {
          return {
            input,
            tokens: this.tokens,
            invalidReason: this.invalidReason
          };
        } else {
          const [rawMatches, matches] = match(input, this.regex, this.handlers), [result, zone, specificOffset] = matches ? dateTimeFromMatches(matches) : [null, null, void 0];
          if (hasOwnProperty(matches, "a") && hasOwnProperty(matches, "H")) {
            throw new ConflictingSpecificationError("Can't include meridiem when specifying 24-hour format");
          }
          return {
            input,
            tokens: this.tokens,
            regex: this.regex,
            rawMatches,
            matches,
            result,
            zone,
            specificOffset
          };
        }
      }
      get isValid() {
        return !this.disqualifyingUnit;
      }
      get invalidReason() {
        return this.disqualifyingUnit ? this.disqualifyingUnit.invalidReason : null;
      }
    };
    function explainFromTokens(locale, input, format) {
      const parser = new TokenParser(locale, format);
      return parser.explainFromTokens(input);
    }
    function parseFromTokens(locale, input, format) {
      const {
        result,
        zone,
        specificOffset,
        invalidReason
      } = explainFromTokens(locale, input, format);
      return [result, zone, specificOffset, invalidReason];
    }
    function formatOptsToTokens(formatOpts, locale) {
      if (!formatOpts) {
        return null;
      }
      const formatter = Formatter.create(locale, formatOpts);
      const df = formatter.dtFormatter(getDummyDateTime());
      const parts = df.formatToParts();
      const resolvedOpts = df.resolvedOptions();
      return parts.map((p) => tokenForPart(p, formatOpts, resolvedOpts));
    }
    var INVALID = "Invalid DateTime";
    var MAX_DATE = 864e13;
    function unsupportedZone(zone) {
      return new Invalid("unsupported zone", `the zone "${zone.name}" is not supported`);
    }
    function possiblyCachedWeekData(dt) {
      if (dt.weekData === null) {
        dt.weekData = gregorianToWeek(dt.c);
      }
      return dt.weekData;
    }
    function possiblyCachedLocalWeekData(dt) {
      if (dt.localWeekData === null) {
        dt.localWeekData = gregorianToWeek(dt.c, dt.loc.getMinDaysInFirstWeek(), dt.loc.getStartOfWeek());
      }
      return dt.localWeekData;
    }
    function clone(inst, alts) {
      const current = {
        ts: inst.ts,
        zone: inst.zone,
        c: inst.c,
        o: inst.o,
        loc: inst.loc,
        invalid: inst.invalid
      };
      return new DateTime({
        ...current,
        ...alts,
        old: current
      });
    }
    function fixOffset(localTS, o, tz) {
      let utcGuess = localTS - o * 60 * 1e3;
      const o2 = tz.offset(utcGuess);
      if (o === o2) {
        return [utcGuess, o];
      }
      utcGuess -= (o2 - o) * 60 * 1e3;
      const o3 = tz.offset(utcGuess);
      if (o2 === o3) {
        return [utcGuess, o2];
      }
      return [localTS - Math.min(o2, o3) * 60 * 1e3, Math.max(o2, o3)];
    }
    function tsToObj(ts, offset2) {
      ts += offset2 * 60 * 1e3;
      const d = new Date(ts);
      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
        second: d.getUTCSeconds(),
        millisecond: d.getUTCMilliseconds()
      };
    }
    function objToTS(obj, offset2, zone) {
      return fixOffset(objToLocalTS(obj), offset2, zone);
    }
    function adjustTime(inst, dur) {
      const oPre = inst.o, year = inst.c.year + Math.trunc(dur.years), month = inst.c.month + Math.trunc(dur.months) + Math.trunc(dur.quarters) * 3, c = {
        ...inst.c,
        year,
        month,
        day: Math.min(inst.c.day, daysInMonth(year, month)) + Math.trunc(dur.days) + Math.trunc(dur.weeks) * 7
      }, millisToAdd = Duration.fromObject({
        years: dur.years - Math.trunc(dur.years),
        quarters: dur.quarters - Math.trunc(dur.quarters),
        months: dur.months - Math.trunc(dur.months),
        weeks: dur.weeks - Math.trunc(dur.weeks),
        days: dur.days - Math.trunc(dur.days),
        hours: dur.hours,
        minutes: dur.minutes,
        seconds: dur.seconds,
        milliseconds: dur.milliseconds
      }).as("milliseconds"), localTS = objToLocalTS(c);
      let [ts, o] = fixOffset(localTS, oPre, inst.zone);
      if (millisToAdd !== 0) {
        ts += millisToAdd;
        o = inst.zone.offset(ts);
      }
      return {
        ts,
        o
      };
    }
    function parseDataToDateTime(parsed, parsedZone, opts, format, text, specificOffset) {
      const {
        setZone,
        zone
      } = opts;
      if (parsed && Object.keys(parsed).length !== 0 || parsedZone) {
        const interpretationZone = parsedZone || zone, inst = DateTime.fromObject(parsed, {
          ...opts,
          zone: interpretationZone,
          specificOffset
        });
        return setZone ? inst : inst.setZone(zone);
      } else {
        return DateTime.invalid(new Invalid("unparsable", `the input "${text}" can't be parsed as ${format}`));
      }
    }
    function toTechFormat(dt, format, allowZ = true) {
      return dt.isValid ? Formatter.create(Locale.create("en-US"), {
        allowZ,
        forceSimple: true
      }).formatDateTimeFromString(dt, format) : null;
    }
    function toISODate(o, extended, precision) {
      const longFormat = o.c.year > 9999 || o.c.year < 0;
      let c = "";
      if (longFormat && o.c.year >= 0) c += "+";
      c += padStart(o.c.year, longFormat ? 6 : 4);
      if (precision === "year") return c;
      if (extended) {
        c += "-";
        c += padStart(o.c.month);
        if (precision === "month") return c;
        c += "-";
      } else {
        c += padStart(o.c.month);
        if (precision === "month") return c;
      }
      c += padStart(o.c.day);
      return c;
    }
    function toISOTime(o, extended, suppressSeconds, suppressMilliseconds, includeOffset, extendedZone, precision) {
      let showSeconds = !suppressSeconds || o.c.millisecond !== 0 || o.c.second !== 0, c = "";
      switch (precision) {
        case "day":
        case "month":
        case "year":
          break;
        default:
          c += padStart(o.c.hour);
          if (precision === "hour") break;
          if (extended) {
            c += ":";
            c += padStart(o.c.minute);
            if (precision === "minute") break;
            if (showSeconds) {
              c += ":";
              c += padStart(o.c.second);
            }
          } else {
            c += padStart(o.c.minute);
            if (precision === "minute") break;
            if (showSeconds) {
              c += padStart(o.c.second);
            }
          }
          if (precision === "second") break;
          if (showSeconds && (!suppressMilliseconds || o.c.millisecond !== 0)) {
            c += ".";
            c += padStart(o.c.millisecond, 3);
          }
      }
      if (includeOffset) {
        if (o.isOffsetFixed && o.offset === 0 && !extendedZone) {
          c += "Z";
        } else if (o.o < 0) {
          c += "-";
          c += padStart(Math.trunc(-o.o / 60));
          c += ":";
          c += padStart(Math.trunc(-o.o % 60));
        } else {
          c += "+";
          c += padStart(Math.trunc(o.o / 60));
          c += ":";
          c += padStart(Math.trunc(o.o % 60));
        }
      }
      if (extendedZone) {
        c += "[" + o.zone.ianaName + "]";
      }
      return c;
    }
    var defaultUnitValues = {
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    };
    var defaultWeekUnitValues = {
      weekNumber: 1,
      weekday: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    };
    var defaultOrdinalUnitValues = {
      ordinal: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    };
    var orderedUnits = ["year", "month", "day", "hour", "minute", "second", "millisecond"];
    var orderedWeekUnits = ["weekYear", "weekNumber", "weekday", "hour", "minute", "second", "millisecond"];
    var orderedOrdinalUnits = ["year", "ordinal", "hour", "minute", "second", "millisecond"];
    function normalizeUnit(unit) {
      const normalized = {
        year: "year",
        years: "year",
        month: "month",
        months: "month",
        day: "day",
        days: "day",
        hour: "hour",
        hours: "hour",
        minute: "minute",
        minutes: "minute",
        quarter: "quarter",
        quarters: "quarter",
        second: "second",
        seconds: "second",
        millisecond: "millisecond",
        milliseconds: "millisecond",
        weekday: "weekday",
        weekdays: "weekday",
        weeknumber: "weekNumber",
        weeksnumber: "weekNumber",
        weeknumbers: "weekNumber",
        weekyear: "weekYear",
        weekyears: "weekYear",
        ordinal: "ordinal"
      }[unit.toLowerCase()];
      if (!normalized) throw new InvalidUnitError(unit);
      return normalized;
    }
    function normalizeUnitWithLocalWeeks(unit) {
      switch (unit.toLowerCase()) {
        case "localweekday":
        case "localweekdays":
          return "localWeekday";
        case "localweeknumber":
        case "localweeknumbers":
          return "localWeekNumber";
        case "localweekyear":
        case "localweekyears":
          return "localWeekYear";
        default:
          return normalizeUnit(unit);
      }
    }
    function guessOffsetForZone(zone) {
      if (zoneOffsetTs === void 0) {
        zoneOffsetTs = Settings.now();
      }
      if (zone.type !== "iana") {
        return zone.offset(zoneOffsetTs);
      }
      const zoneName = zone.name;
      let offsetGuess = zoneOffsetGuessCache.get(zoneName);
      if (offsetGuess === void 0) {
        offsetGuess = zone.offset(zoneOffsetTs);
        zoneOffsetGuessCache.set(zoneName, offsetGuess);
      }
      return offsetGuess;
    }
    function quickDT(obj, opts) {
      const zone = normalizeZone(opts.zone, Settings.defaultZone);
      if (!zone.isValid) {
        return DateTime.invalid(unsupportedZone(zone));
      }
      const loc = Locale.fromObject(opts);
      let ts, o;
      if (!isUndefined(obj.year)) {
        for (const u of orderedUnits) {
          if (isUndefined(obj[u])) {
            obj[u] = defaultUnitValues[u];
          }
        }
        const invalid = hasInvalidGregorianData(obj) || hasInvalidTimeData(obj);
        if (invalid) {
          return DateTime.invalid(invalid);
        }
        const offsetProvis = guessOffsetForZone(zone);
        [ts, o] = objToTS(obj, offsetProvis, zone);
      } else {
        ts = Settings.now();
      }
      return new DateTime({
        ts,
        zone,
        loc,
        o
      });
    }
    function diffRelative(start, end, opts) {
      const round = isUndefined(opts.round) ? true : opts.round, rounding = isUndefined(opts.rounding) ? "trunc" : opts.rounding, format = (c, unit) => {
        c = roundTo(c, round || opts.calendary ? 0 : 2, opts.calendary ? "round" : rounding);
        const formatter = end.loc.clone(opts).relFormatter(opts);
        return formatter.format(c, unit);
      }, differ = (unit) => {
        if (opts.calendary) {
          if (!end.hasSame(start, unit)) {
            return end.startOf(unit).diff(start.startOf(unit), unit).get(unit);
          } else return 0;
        } else {
          return end.diff(start, unit).get(unit);
        }
      };
      if (opts.unit) {
        return format(differ(opts.unit), opts.unit);
      }
      for (const unit of opts.units) {
        const count = differ(unit);
        if (Math.abs(count) >= 1) {
          return format(count, unit);
        }
      }
      return format(start > end ? -0 : 0, opts.units[opts.units.length - 1]);
    }
    function lastOpts(argList) {
      let opts = {}, args;
      if (argList.length > 0 && typeof argList[argList.length - 1] === "object") {
        opts = argList[argList.length - 1];
        args = Array.from(argList).slice(0, argList.length - 1);
      } else {
        args = Array.from(argList);
      }
      return [opts, args];
    }
    var zoneOffsetTs;
    var zoneOffsetGuessCache = /* @__PURE__ */ new Map();
    var DateTime = class _DateTime {
      /**
       * @access private
       */
      constructor(config) {
        const zone = config.zone || Settings.defaultZone;
        let invalid = config.invalid || (Number.isNaN(config.ts) ? new Invalid("invalid input") : null) || (!zone.isValid ? unsupportedZone(zone) : null);
        this.ts = isUndefined(config.ts) ? Settings.now() : config.ts;
        let c = null, o = null;
        if (!invalid) {
          const unchanged = config.old && config.old.ts === this.ts && config.old.zone.equals(zone);
          if (unchanged) {
            [c, o] = [config.old.c, config.old.o];
          } else {
            const ot = isNumber(config.o) && !config.old ? config.o : zone.offset(this.ts);
            c = tsToObj(this.ts, ot);
            invalid = Number.isNaN(c.year) ? new Invalid("invalid input") : null;
            c = invalid ? null : c;
            o = invalid ? null : ot;
          }
        }
        this._zone = zone;
        this.loc = config.loc || Locale.create();
        this.invalid = invalid;
        this.weekData = null;
        this.localWeekData = null;
        this.c = c;
        this.o = o;
        this.isLuxonDateTime = true;
      }
      // CONSTRUCT
      /**
       * Create a DateTime for the current instant, in the system's time zone.
       *
       * Use Settings to override these default values if needed.
       * @example DateTime.now().toISO() //~> now in the ISO format
       * @return {DateTime}
       */
      static now() {
        return new _DateTime({});
      }
      /**
       * Create a local DateTime
       * @param {number} [year] - The calendar year. If omitted (as in, call `local()` with no arguments), the current time will be used
       * @param {number} [month=1] - The month, 1-indexed
       * @param {number} [day=1] - The day of the month, 1-indexed
       * @param {number} [hour=0] - The hour of the day, in 24-hour time
       * @param {number} [minute=0] - The minute of the hour, meaning a number between 0 and 59
       * @param {number} [second=0] - The second of the minute, meaning a number between 0 and 59
       * @param {number} [millisecond=0] - The millisecond of the second, meaning a number between 0 and 999
       * @example DateTime.local()                                  //~> now
       * @example DateTime.local({ zone: "America/New_York" })      //~> now, in US east coast time
       * @example DateTime.local(2017)                              //~> 2017-01-01T00:00:00
       * @example DateTime.local(2017, 3)                           //~> 2017-03-01T00:00:00
       * @example DateTime.local(2017, 3, 12, { locale: "fr" })     //~> 2017-03-12T00:00:00, with a French locale
       * @example DateTime.local(2017, 3, 12, 5)                    //~> 2017-03-12T05:00:00
       * @example DateTime.local(2017, 3, 12, 5, { zone: "utc" })   //~> 2017-03-12T05:00:00, in UTC
       * @example DateTime.local(2017, 3, 12, 5, 45)                //~> 2017-03-12T05:45:00
       * @example DateTime.local(2017, 3, 12, 5, 45, 10)            //~> 2017-03-12T05:45:10
       * @example DateTime.local(2017, 3, 12, 5, 45, 10, 765)       //~> 2017-03-12T05:45:10.765
       * @return {DateTime}
       */
      static local() {
        const [opts, args] = lastOpts(arguments), [year, month, day, hour, minute, second, millisecond] = args;
        return quickDT({
          year,
          month,
          day,
          hour,
          minute,
          second,
          millisecond
        }, opts);
      }
      /**
       * Create a DateTime in UTC
       * @param {number} [year] - The calendar year. If omitted (as in, call `utc()` with no arguments), the current time will be used
       * @param {number} [month=1] - The month, 1-indexed
       * @param {number} [day=1] - The day of the month
       * @param {number} [hour=0] - The hour of the day, in 24-hour time
       * @param {number} [minute=0] - The minute of the hour, meaning a number between 0 and 59
       * @param {number} [second=0] - The second of the minute, meaning a number between 0 and 59
       * @param {number} [millisecond=0] - The millisecond of the second, meaning a number between 0 and 999
       * @param {Object} options - configuration options for the DateTime
       * @param {string} [options.locale] - a locale to set on the resulting DateTime instance
       * @param {string} [options.outputCalendar] - the output calendar to set on the resulting DateTime instance
       * @param {string} [options.numberingSystem] - the numbering system to set on the resulting DateTime instance
       * @param {string} [options.weekSettings] - the week settings to set on the resulting DateTime instance
       * @example DateTime.utc()                                              //~> now
       * @example DateTime.utc(2017)                                          //~> 2017-01-01T00:00:00Z
       * @example DateTime.utc(2017, 3)                                       //~> 2017-03-01T00:00:00Z
       * @example DateTime.utc(2017, 3, 12)                                   //~> 2017-03-12T00:00:00Z
       * @example DateTime.utc(2017, 3, 12, 5)                                //~> 2017-03-12T05:00:00Z
       * @example DateTime.utc(2017, 3, 12, 5, 45)                            //~> 2017-03-12T05:45:00Z
       * @example DateTime.utc(2017, 3, 12, 5, 45, { locale: "fr" })          //~> 2017-03-12T05:45:00Z with a French locale
       * @example DateTime.utc(2017, 3, 12, 5, 45, 10)                        //~> 2017-03-12T05:45:10Z
       * @example DateTime.utc(2017, 3, 12, 5, 45, 10, 765, { locale: "fr" }) //~> 2017-03-12T05:45:10.765Z with a French locale
       * @return {DateTime}
       */
      static utc() {
        const [opts, args] = lastOpts(arguments), [year, month, day, hour, minute, second, millisecond] = args;
        opts.zone = FixedOffsetZone.utcInstance;
        return quickDT({
          year,
          month,
          day,
          hour,
          minute,
          second,
          millisecond
        }, opts);
      }
      /**
       * Create a DateTime from a JavaScript Date object. Uses the default zone.
       * @param {Date} date - a JavaScript Date object
       * @param {Object} options - configuration options for the DateTime
       * @param {string|Zone} [options.zone='local'] - the zone to place the DateTime into
       * @return {DateTime}
       */
      static fromJSDate(date, options = {}) {
        const ts = isDate(date) ? date.valueOf() : NaN;
        if (Number.isNaN(ts)) {
          return _DateTime.invalid("invalid input");
        }
        const zoneToUse = normalizeZone(options.zone, Settings.defaultZone);
        if (!zoneToUse.isValid) {
          return _DateTime.invalid(unsupportedZone(zoneToUse));
        }
        return new _DateTime({
          ts,
          zone: zoneToUse,
          loc: Locale.fromObject(options)
        });
      }
      /**
       * Create a DateTime from a number of milliseconds since the epoch (meaning since 1 January 1970 00:00:00 UTC). Uses the default zone.
       * @param {number} milliseconds - a number of milliseconds since 1970 UTC
       * @param {Object} options - configuration options for the DateTime
       * @param {string|Zone} [options.zone='local'] - the zone to place the DateTime into
       * @param {string} [options.locale] - a locale to set on the resulting DateTime instance
       * @param {string} options.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @param {string} options.numberingSystem - the numbering system to set on the resulting DateTime instance
       * @param {string} options.weekSettings - the week settings to set on the resulting DateTime instance
       * @return {DateTime}
       */
      static fromMillis(milliseconds, options = {}) {
        if (!isNumber(milliseconds)) {
          throw new InvalidArgumentError(`fromMillis requires a numerical input, but received a ${typeof milliseconds} with value ${milliseconds}`);
        } else if (milliseconds < -MAX_DATE || milliseconds > MAX_DATE) {
          return _DateTime.invalid("Timestamp out of range");
        } else {
          return new _DateTime({
            ts: milliseconds,
            zone: normalizeZone(options.zone, Settings.defaultZone),
            loc: Locale.fromObject(options)
          });
        }
      }
      /**
       * Create a DateTime from a number of seconds since the epoch (meaning since 1 January 1970 00:00:00 UTC). Uses the default zone.
       * @param {number} seconds - a number of seconds since 1970 UTC
       * @param {Object} options - configuration options for the DateTime
       * @param {string|Zone} [options.zone='local'] - the zone to place the DateTime into
       * @param {string} [options.locale] - a locale to set on the resulting DateTime instance
       * @param {string} options.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @param {string} options.numberingSystem - the numbering system to set on the resulting DateTime instance
       * @param {string} options.weekSettings - the week settings to set on the resulting DateTime instance
       * @return {DateTime}
       */
      static fromSeconds(seconds, options = {}) {
        if (!isNumber(seconds)) {
          throw new InvalidArgumentError("fromSeconds requires a numerical input");
        } else {
          return new _DateTime({
            ts: seconds * 1e3,
            zone: normalizeZone(options.zone, Settings.defaultZone),
            loc: Locale.fromObject(options)
          });
        }
      }
      /**
       * Create a DateTime from a JavaScript object with keys like 'year' and 'hour' with reasonable defaults.
       * @param {Object} obj - the object to create the DateTime from
       * @param {number} obj.year - a year, such as 1987
       * @param {number} obj.month - a month, 1-12
       * @param {number} obj.day - a day of the month, 1-31, depending on the month
       * @param {number} obj.ordinal - day of the year, 1-365 or 366
       * @param {number} obj.weekYear - an ISO week year
       * @param {number} obj.weekNumber - an ISO week number, between 1 and 52 or 53, depending on the year
       * @param {number} obj.weekday - an ISO weekday, 1-7, where 1 is Monday and 7 is Sunday
       * @param {number} obj.localWeekYear - a week year, according to the locale
       * @param {number} obj.localWeekNumber - a week number, between 1 and 52 or 53, depending on the year, according to the locale
       * @param {number} obj.localWeekday - a weekday, 1-7, where 1 is the first and 7 is the last day of the week, according to the locale
       * @param {number} obj.hour - hour of the day, 0-23
       * @param {number} obj.minute - minute of the hour, 0-59
       * @param {number} obj.second - second of the minute, 0-59
       * @param {number} obj.millisecond - millisecond of the second, 0-999
       * @param {Object} opts - options for creating this DateTime
       * @param {string|Zone} [opts.zone='local'] - interpret the numbers in the context of a particular zone. Can take any value taken as the first argument to setZone()
       * @param {string} [opts.locale='system\'s locale'] - a locale to set on the resulting DateTime instance
       * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @param {string} opts.numberingSystem - the numbering system to set on the resulting DateTime instance
       * @param {string} opts.weekSettings - the week settings to set on the resulting DateTime instance
       * @example DateTime.fromObject({ year: 1982, month: 5, day: 25}).toISODate() //=> '1982-05-25'
       * @example DateTime.fromObject({ year: 1982 }).toISODate() //=> '1982-01-01'
       * @example DateTime.fromObject({ hour: 10, minute: 26, second: 6 }) //~> today at 10:26:06
       * @example DateTime.fromObject({ hour: 10, minute: 26, second: 6 }, { zone: 'utc' }),
       * @example DateTime.fromObject({ hour: 10, minute: 26, second: 6 }, { zone: 'local' })
       * @example DateTime.fromObject({ hour: 10, minute: 26, second: 6 }, { zone: 'America/New_York' })
       * @example DateTime.fromObject({ weekYear: 2016, weekNumber: 2, weekday: 3 }).toISODate() //=> '2016-01-13'
       * @example DateTime.fromObject({ localWeekYear: 2022, localWeekNumber: 1, localWeekday: 1 }, { locale: "en-US" }).toISODate() //=> '2021-12-26'
       * @return {DateTime}
       */
      static fromObject(obj, opts = {}) {
        obj = obj || {};
        const zoneToUse = normalizeZone(opts.zone, Settings.defaultZone);
        if (!zoneToUse.isValid) {
          return _DateTime.invalid(unsupportedZone(zoneToUse));
        }
        const loc = Locale.fromObject(opts);
        const normalized = normalizeObject(obj, normalizeUnitWithLocalWeeks);
        const {
          minDaysInFirstWeek,
          startOfWeek
        } = usesLocalWeekValues(normalized, loc);
        const tsNow = Settings.now(), offsetProvis = !isUndefined(opts.specificOffset) ? opts.specificOffset : zoneToUse.offset(tsNow), containsOrdinal = !isUndefined(normalized.ordinal), containsGregorYear = !isUndefined(normalized.year), containsGregorMD = !isUndefined(normalized.month) || !isUndefined(normalized.day), containsGregor = containsGregorYear || containsGregorMD, definiteWeekDef = normalized.weekYear || normalized.weekNumber;
        if ((containsGregor || containsOrdinal) && definiteWeekDef) {
          throw new ConflictingSpecificationError("Can't mix weekYear/weekNumber units with year/month/day or ordinals");
        }
        if (containsGregorMD && containsOrdinal) {
          throw new ConflictingSpecificationError("Can't mix ordinal dates with month/day");
        }
        const useWeekData = definiteWeekDef || normalized.weekday && !containsGregor;
        let units, defaultValues, objNow = tsToObj(tsNow, offsetProvis);
        if (useWeekData) {
          units = orderedWeekUnits;
          defaultValues = defaultWeekUnitValues;
          objNow = gregorianToWeek(objNow, minDaysInFirstWeek, startOfWeek);
        } else if (containsOrdinal) {
          units = orderedOrdinalUnits;
          defaultValues = defaultOrdinalUnitValues;
          objNow = gregorianToOrdinal(objNow);
        } else {
          units = orderedUnits;
          defaultValues = defaultUnitValues;
        }
        let foundFirst = false;
        for (const u of units) {
          const v = normalized[u];
          if (!isUndefined(v)) {
            foundFirst = true;
          } else if (foundFirst) {
            normalized[u] = defaultValues[u];
          } else {
            normalized[u] = objNow[u];
          }
        }
        const higherOrderInvalid = useWeekData ? hasInvalidWeekData(normalized, minDaysInFirstWeek, startOfWeek) : containsOrdinal ? hasInvalidOrdinalData(normalized) : hasInvalidGregorianData(normalized), invalid = higherOrderInvalid || hasInvalidTimeData(normalized);
        if (invalid) {
          return _DateTime.invalid(invalid);
        }
        const gregorian = useWeekData ? weekToGregorian(normalized, minDaysInFirstWeek, startOfWeek) : containsOrdinal ? ordinalToGregorian(normalized) : normalized, [tsFinal, offsetFinal] = objToTS(gregorian, offsetProvis, zoneToUse), inst = new _DateTime({
          ts: tsFinal,
          zone: zoneToUse,
          o: offsetFinal,
          loc
        });
        if (normalized.weekday && containsGregor && obj.weekday !== inst.weekday) {
          return _DateTime.invalid("mismatched weekday", `you can't specify both a weekday of ${normalized.weekday} and a date of ${inst.toISO()}`);
        }
        if (!inst.isValid) {
          return _DateTime.invalid(inst.invalid);
        }
        return inst;
      }
      /**
       * Create a DateTime from an ISO 8601 string
       * @param {string} text - the ISO string
       * @param {Object} opts - options to affect the creation
       * @param {string|Zone} [opts.zone='local'] - use this zone if no offset is specified in the input string itself. Will also convert the time to this zone
       * @param {boolean} [opts.setZone=false] - override the zone with a fixed-offset zone specified in the string itself, if it specifies one
       * @param {string} [opts.locale='system's locale'] - a locale to set on the resulting DateTime instance
       * @param {string} [opts.outputCalendar] - the output calendar to set on the resulting DateTime instance
       * @param {string} [opts.numberingSystem] - the numbering system to set on the resulting DateTime instance
       * @param {string} [opts.weekSettings] - the week settings to set on the resulting DateTime instance
       * @example DateTime.fromISO('2016-05-25T09:08:34.123')
       * @example DateTime.fromISO('2016-05-25T09:08:34.123+06:00')
       * @example DateTime.fromISO('2016-05-25T09:08:34.123+06:00', {setZone: true})
       * @example DateTime.fromISO('2016-05-25T09:08:34.123', {zone: 'utc'})
       * @example DateTime.fromISO('2016-W05-4')
       * @return {DateTime}
       */
      static fromISO(text, opts = {}) {
        const [vals, parsedZone] = parseISODate(text);
        return parseDataToDateTime(vals, parsedZone, opts, "ISO 8601", text);
      }
      /**
       * Create a DateTime from an RFC 2822 string
       * @param {string} text - the RFC 2822 string
       * @param {Object} opts - options to affect the creation
       * @param {string|Zone} [opts.zone='local'] - convert the time to this zone. Since the offset is always specified in the string itself, this has no effect on the interpretation of string, merely the zone the resulting DateTime is expressed in.
       * @param {boolean} [opts.setZone=false] - override the zone with a fixed-offset zone specified in the string itself, if it specifies one
       * @param {string} [opts.locale='system's locale'] - a locale to set on the resulting DateTime instance
       * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @param {string} opts.numberingSystem - the numbering system to set on the resulting DateTime instance
       * @param {string} opts.weekSettings - the week settings to set on the resulting DateTime instance
       * @example DateTime.fromRFC2822('25 Nov 2016 13:23:12 GMT')
       * @example DateTime.fromRFC2822('Fri, 25 Nov 2016 13:23:12 +0600')
       * @example DateTime.fromRFC2822('25 Nov 2016 13:23 Z')
       * @return {DateTime}
       */
      static fromRFC2822(text, opts = {}) {
        const [vals, parsedZone] = parseRFC2822Date(text);
        return parseDataToDateTime(vals, parsedZone, opts, "RFC 2822", text);
      }
      /**
       * Create a DateTime from an HTTP header date
       * @see https://www.w3.org/Protocols/rfc2616/rfc2616-sec3.html#sec3.3.1
       * @param {string} text - the HTTP header date
       * @param {Object} opts - options to affect the creation
       * @param {string|Zone} [opts.zone='local'] - convert the time to this zone. Since HTTP dates are always in UTC, this has no effect on the interpretation of string, merely the zone the resulting DateTime is expressed in.
       * @param {boolean} [opts.setZone=false] - override the zone with the fixed-offset zone specified in the string. For HTTP dates, this is always UTC, so this option is equivalent to setting the `zone` option to 'utc', but this option is included for consistency with similar methods.
       * @param {string} [opts.locale='system's locale'] - a locale to set on the resulting DateTime instance
       * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @param {string} opts.numberingSystem - the numbering system to set on the resulting DateTime instance
       * @param {string} opts.weekSettings - the week settings to set on the resulting DateTime instance
       * @example DateTime.fromHTTP('Sun, 06 Nov 1994 08:49:37 GMT')
       * @example DateTime.fromHTTP('Sunday, 06-Nov-94 08:49:37 GMT')
       * @example DateTime.fromHTTP('Sun Nov  6 08:49:37 1994')
       * @return {DateTime}
       */
      static fromHTTP(text, opts = {}) {
        const [vals, parsedZone] = parseHTTPDate(text);
        return parseDataToDateTime(vals, parsedZone, opts, "HTTP", opts);
      }
      /**
       * Create a DateTime from an input string and format string.
       * Defaults to en-US if no locale has been specified, regardless of the system's locale. For a table of tokens and their interpretations, see [here](https://moment.github.io/luxon/#/parsing?id=table-of-tokens).
       * @param {string} text - the string to parse
       * @param {string} fmt - the format the string is expected to be in (see the link below for the formats)
       * @param {Object} opts - options to affect the creation
       * @param {string|Zone} [opts.zone='local'] - use this zone if no offset is specified in the input string itself. Will also convert the DateTime to this zone
       * @param {boolean} [opts.setZone=false] - override the zone with a zone specified in the string itself, if it specifies one
       * @param {string} [opts.locale='en-US'] - a locale string to use when parsing. Will also set the DateTime to this locale
       * @param {string} opts.numberingSystem - the numbering system to use when parsing. Will also set the resulting DateTime to this numbering system
       * @param {string} opts.weekSettings - the week settings to set on the resulting DateTime instance
       * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @return {DateTime}
       */
      static fromFormat(text, fmt, opts = {}) {
        if (isUndefined(text) || isUndefined(fmt)) {
          throw new InvalidArgumentError("fromFormat requires an input string and a format");
        }
        const {
          locale = null,
          numberingSystem = null
        } = opts, localeToUse = Locale.fromOpts({
          locale,
          numberingSystem,
          defaultToEN: true
        }), [vals, parsedZone, specificOffset, invalid] = parseFromTokens(localeToUse, text, fmt);
        if (invalid) {
          return _DateTime.invalid(invalid);
        } else {
          return parseDataToDateTime(vals, parsedZone, opts, `format ${fmt}`, text, specificOffset);
        }
      }
      /**
       * @deprecated use fromFormat instead
       */
      static fromString(text, fmt, opts = {}) {
        return _DateTime.fromFormat(text, fmt, opts);
      }
      /**
       * Create a DateTime from a SQL date, time, or datetime
       * Defaults to en-US if no locale has been specified, regardless of the system's locale
       * @param {string} text - the string to parse
       * @param {Object} opts - options to affect the creation
       * @param {string|Zone} [opts.zone='local'] - use this zone if no offset is specified in the input string itself. Will also convert the DateTime to this zone
       * @param {boolean} [opts.setZone=false] - override the zone with a zone specified in the string itself, if it specifies one
       * @param {string} [opts.locale='en-US'] - a locale string to use when parsing. Will also set the DateTime to this locale
       * @param {string} opts.numberingSystem - the numbering system to use when parsing. Will also set the resulting DateTime to this numbering system
       * @param {string} opts.weekSettings - the week settings to set on the resulting DateTime instance
       * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @example DateTime.fromSQL('2017-05-15')
       * @example DateTime.fromSQL('2017-05-15 09:12:34')
       * @example DateTime.fromSQL('2017-05-15 09:12:34.342')
       * @example DateTime.fromSQL('2017-05-15 09:12:34.342+06:00')
       * @example DateTime.fromSQL('2017-05-15 09:12:34.342 America/Los_Angeles')
       * @example DateTime.fromSQL('2017-05-15 09:12:34.342 America/Los_Angeles', { setZone: true })
       * @example DateTime.fromSQL('2017-05-15 09:12:34.342', { zone: 'America/Los_Angeles' })
       * @example DateTime.fromSQL('09:12:34.342')
       * @return {DateTime}
       */
      static fromSQL(text, opts = {}) {
        const [vals, parsedZone] = parseSQL(text);
        return parseDataToDateTime(vals, parsedZone, opts, "SQL", text);
      }
      /**
       * Create an invalid DateTime.
       * @param {string} reason - simple string of why this DateTime is invalid. Should not contain parameters or anything else data-dependent.
       * @param {string} [explanation=null] - longer explanation, may include parameters and other useful debugging information
       * @return {DateTime}
       */
      static invalid(reason, explanation = null) {
        if (!reason) {
          throw new InvalidArgumentError("need to specify a reason the DateTime is invalid");
        }
        const invalid = reason instanceof Invalid ? reason : new Invalid(reason, explanation);
        if (Settings.throwOnInvalid) {
          throw new InvalidDateTimeError(invalid);
        } else {
          return new _DateTime({
            invalid
          });
        }
      }
      /**
       * Check if an object is an instance of DateTime. Works across context boundaries
       * @param {object} o
       * @return {boolean}
       */
      static isDateTime(o) {
        return o && o.isLuxonDateTime || false;
      }
      /**
       * Produce the format string for a set of options
       * @param formatOpts
       * @param localeOpts
       * @returns {string}
       */
      static parseFormatForOpts(formatOpts, localeOpts = {}) {
        const tokenList = formatOptsToTokens(formatOpts, Locale.fromObject(localeOpts));
        return !tokenList ? null : tokenList.map((t) => t ? t.val : null).join("");
      }
      /**
       * Produce the the fully expanded format token for the locale
       * Does NOT quote characters, so quoted tokens will not round trip correctly
       * @param fmt
       * @param localeOpts
       * @returns {string}
       */
      static expandFormat(fmt, localeOpts = {}) {
        const expanded = expandMacroTokens(Formatter.parseFormat(fmt), Locale.fromObject(localeOpts));
        return expanded.map((t) => t.val).join("");
      }
      static resetCache() {
        zoneOffsetTs = void 0;
        zoneOffsetGuessCache.clear();
      }
      // INFO
      /**
       * Get the value of unit.
       * @param {string} unit - a unit such as 'minute' or 'day'
       * @example DateTime.local(2017, 7, 4).get('month'); //=> 7
       * @example DateTime.local(2017, 7, 4).get('day'); //=> 4
       * @return {number}
       */
      get(unit) {
        return this[unit];
      }
      /**
       * Returns whether the DateTime is valid. Invalid DateTimes occur when:
       * * The DateTime was created from invalid calendar information, such as the 13th month or February 30
       * * The DateTime was created by an operation on another invalid date
       * @type {boolean}
       */
      get isValid() {
        return this.invalid === null;
      }
      /**
       * Returns an error code if this DateTime is invalid, or null if the DateTime is valid
       * @type {string}
       */
      get invalidReason() {
        return this.invalid ? this.invalid.reason : null;
      }
      /**
       * Returns an explanation of why this DateTime became invalid, or null if the DateTime is valid
       * @type {string}
       */
      get invalidExplanation() {
        return this.invalid ? this.invalid.explanation : null;
      }
      /**
       * Get the locale of a DateTime, such 'en-GB'. The locale is used when formatting the DateTime
       *
       * @type {string}
       */
      get locale() {
        return this.isValid ? this.loc.locale : null;
      }
      /**
       * Get the numbering system of a DateTime, such 'beng'. The numbering system is used when formatting the DateTime
       *
       * @type {string}
       */
      get numberingSystem() {
        return this.isValid ? this.loc.numberingSystem : null;
      }
      /**
       * Get the output calendar of a DateTime, such 'islamic'. The output calendar is used when formatting the DateTime
       *
       * @type {string}
       */
      get outputCalendar() {
        return this.isValid ? this.loc.outputCalendar : null;
      }
      /**
       * Get the time zone associated with this DateTime.
       * @type {Zone}
       */
      get zone() {
        return this._zone;
      }
      /**
       * Get the name of the time zone.
       * @type {string}
       */
      get zoneName() {
        return this.isValid ? this.zone.name : null;
      }
      /**
       * Get the year
       * @example DateTime.local(2017, 5, 25).year //=> 2017
       * @type {number}
       */
      get year() {
        return this.isValid ? this.c.year : NaN;
      }
      /**
       * Get the quarter
       * @example DateTime.local(2017, 5, 25).quarter //=> 2
       * @type {number}
       */
      get quarter() {
        return this.isValid ? Math.ceil(this.c.month / 3) : NaN;
      }
      /**
       * Get the month (1-12).
       * @example DateTime.local(2017, 5, 25).month //=> 5
       * @type {number}
       */
      get month() {
        return this.isValid ? this.c.month : NaN;
      }
      /**
       * Get the day of the month (1-30ish).
       * @example DateTime.local(2017, 5, 25).day //=> 25
       * @type {number}
       */
      get day() {
        return this.isValid ? this.c.day : NaN;
      }
      /**
       * Get the hour of the day (0-23).
       * @example DateTime.local(2017, 5, 25, 9).hour //=> 9
       * @type {number}
       */
      get hour() {
        return this.isValid ? this.c.hour : NaN;
      }
      /**
       * Get the minute of the hour (0-59).
       * @example DateTime.local(2017, 5, 25, 9, 30).minute //=> 30
       * @type {number}
       */
      get minute() {
        return this.isValid ? this.c.minute : NaN;
      }
      /**
       * Get the second of the minute (0-59).
       * @example DateTime.local(2017, 5, 25, 9, 30, 52).second //=> 52
       * @type {number}
       */
      get second() {
        return this.isValid ? this.c.second : NaN;
      }
      /**
       * Get the millisecond of the second (0-999).
       * @example DateTime.local(2017, 5, 25, 9, 30, 52, 654).millisecond //=> 654
       * @type {number}
       */
      get millisecond() {
        return this.isValid ? this.c.millisecond : NaN;
      }
      /**
       * Get the week year
       * @see https://en.wikipedia.org/wiki/ISO_week_date
       * @example DateTime.local(2014, 12, 31).weekYear //=> 2015
       * @type {number}
       */
      get weekYear() {
        return this.isValid ? possiblyCachedWeekData(this).weekYear : NaN;
      }
      /**
       * Get the week number of the week year (1-52ish).
       * @see https://en.wikipedia.org/wiki/ISO_week_date
       * @example DateTime.local(2017, 5, 25).weekNumber //=> 21
       * @type {number}
       */
      get weekNumber() {
        return this.isValid ? possiblyCachedWeekData(this).weekNumber : NaN;
      }
      /**
       * Get the day of the week.
       * 1 is Monday and 7 is Sunday
       * @see https://en.wikipedia.org/wiki/ISO_week_date
       * @example DateTime.local(2014, 11, 31).weekday //=> 4
       * @type {number}
       */
      get weekday() {
        return this.isValid ? possiblyCachedWeekData(this).weekday : NaN;
      }
      /**
       * Returns true if this date is on a weekend according to the locale, false otherwise
       * @returns {boolean}
       */
      get isWeekend() {
        return this.isValid && this.loc.getWeekendDays().includes(this.weekday);
      }
      /**
       * Get the day of the week according to the locale.
       * 1 is the first day of the week and 7 is the last day of the week.
       * If the locale assigns Sunday as the first day of the week, then a date which is a Sunday will return 1,
       * @returns {number}
       */
      get localWeekday() {
        return this.isValid ? possiblyCachedLocalWeekData(this).weekday : NaN;
      }
      /**
       * Get the week number of the week year according to the locale. Different locales assign week numbers differently,
       * because the week can start on different days of the week (see localWeekday) and because a different number of days
       * is required for a week to count as the first week of a year.
       * @returns {number}
       */
      get localWeekNumber() {
        return this.isValid ? possiblyCachedLocalWeekData(this).weekNumber : NaN;
      }
      /**
       * Get the week year according to the locale. Different locales assign week numbers (and therefor week years)
       * differently, see localWeekNumber.
       * @returns {number}
       */
      get localWeekYear() {
        return this.isValid ? possiblyCachedLocalWeekData(this).weekYear : NaN;
      }
      /**
       * Get the ordinal (meaning the day of the year)
       * @example DateTime.local(2017, 5, 25).ordinal //=> 145
       * @type {number|DateTime}
       */
      get ordinal() {
        return this.isValid ? gregorianToOrdinal(this.c).ordinal : NaN;
      }
      /**
       * Get the human readable short month name, such as 'Oct'.
       * Defaults to the system's locale if no locale has been specified
       * @example DateTime.local(2017, 10, 30).monthShort //=> Oct
       * @type {string}
       */
      get monthShort() {
        return this.isValid ? Info.months("short", {
          locObj: this.loc
        })[this.month - 1] : null;
      }
      /**
       * Get the human readable long month name, such as 'October'.
       * Defaults to the system's locale if no locale has been specified
       * @example DateTime.local(2017, 10, 30).monthLong //=> October
       * @type {string}
       */
      get monthLong() {
        return this.isValid ? Info.months("long", {
          locObj: this.loc
        })[this.month - 1] : null;
      }
      /**
       * Get the human readable short weekday, such as 'Mon'.
       * Defaults to the system's locale if no locale has been specified
       * @example DateTime.local(2017, 10, 30).weekdayShort //=> Mon
       * @type {string}
       */
      get weekdayShort() {
        return this.isValid ? Info.weekdays("short", {
          locObj: this.loc
        })[this.weekday - 1] : null;
      }
      /**
       * Get the human readable long weekday, such as 'Monday'.
       * Defaults to the system's locale if no locale has been specified
       * @example DateTime.local(2017, 10, 30).weekdayLong //=> Monday
       * @type {string}
       */
      get weekdayLong() {
        return this.isValid ? Info.weekdays("long", {
          locObj: this.loc
        })[this.weekday - 1] : null;
      }
      /**
       * Get the UTC offset of this DateTime in minutes
       * @example DateTime.now().offset //=> -240
       * @example DateTime.utc().offset //=> 0
       * @type {number}
       */
      get offset() {
        return this.isValid ? +this.o : NaN;
      }
      /**
       * Get the short human name for the zone's current offset, for example "EST" or "EDT".
       * Defaults to the system's locale if no locale has been specified
       * @type {string}
       */
      get offsetNameShort() {
        if (this.isValid) {
          return this.zone.offsetName(this.ts, {
            format: "short",
            locale: this.locale
          });
        } else {
          return null;
        }
      }
      /**
       * Get the long human name for the zone's current offset, for example "Eastern Standard Time" or "Eastern Daylight Time".
       * Defaults to the system's locale if no locale has been specified
       * @type {string}
       */
      get offsetNameLong() {
        if (this.isValid) {
          return this.zone.offsetName(this.ts, {
            format: "long",
            locale: this.locale
          });
        } else {
          return null;
        }
      }
      /**
       * Get whether this zone's offset ever changes, as in a DST.
       * @type {boolean}
       */
      get isOffsetFixed() {
        return this.isValid ? this.zone.isUniversal : null;
      }
      /**
       * Get whether the DateTime is in a DST.
       * @type {boolean}
       */
      get isInDST() {
        if (this.isOffsetFixed) {
          return false;
        } else {
          return this.offset > this.set({
            month: 1,
            day: 1
          }).offset || this.offset > this.set({
            month: 5
          }).offset;
        }
      }
      /**
       * Get those DateTimes which have the same local time as this DateTime, but a different offset from UTC
       * in this DateTime's zone. During DST changes local time can be ambiguous, for example
       * `2023-10-29T02:30:00` in `Europe/Berlin` can have offset `+01:00` or `+02:00`.
       * This method will return both possible DateTimes if this DateTime's local time is ambiguous.
       * @returns {DateTime[]}
       */
      getPossibleOffsets() {
        if (!this.isValid || this.isOffsetFixed) {
          return [this];
        }
        const dayMs = 864e5;
        const minuteMs = 6e4;
        const localTS = objToLocalTS(this.c);
        const oEarlier = this.zone.offset(localTS - dayMs);
        const oLater = this.zone.offset(localTS + dayMs);
        const o1 = this.zone.offset(localTS - oEarlier * minuteMs);
        const o2 = this.zone.offset(localTS - oLater * minuteMs);
        if (o1 === o2) {
          return [this];
        }
        const ts1 = localTS - o1 * minuteMs;
        const ts2 = localTS - o2 * minuteMs;
        const c1 = tsToObj(ts1, o1);
        const c2 = tsToObj(ts2, o2);
        if (c1.hour === c2.hour && c1.minute === c2.minute && c1.second === c2.second && c1.millisecond === c2.millisecond) {
          return [clone(this, {
            ts: ts1
          }), clone(this, {
            ts: ts2
          })];
        }
        return [this];
      }
      /**
       * Returns true if this DateTime is in a leap year, false otherwise
       * @example DateTime.local(2016).isInLeapYear //=> true
       * @example DateTime.local(2013).isInLeapYear //=> false
       * @type {boolean}
       */
      get isInLeapYear() {
        return isLeapYear(this.year);
      }
      /**
       * Returns the number of days in this DateTime's month
       * @example DateTime.local(2016, 2).daysInMonth //=> 29
       * @example DateTime.local(2016, 3).daysInMonth //=> 31
       * @type {number}
       */
      get daysInMonth() {
        return daysInMonth(this.year, this.month);
      }
      /**
       * Returns the number of days in this DateTime's year
       * @example DateTime.local(2016).daysInYear //=> 366
       * @example DateTime.local(2013).daysInYear //=> 365
       * @type {number}
       */
      get daysInYear() {
        return this.isValid ? daysInYear(this.year) : NaN;
      }
      /**
       * Returns the number of weeks in this DateTime's year
       * @see https://en.wikipedia.org/wiki/ISO_week_date
       * @example DateTime.local(2004).weeksInWeekYear //=> 53
       * @example DateTime.local(2013).weeksInWeekYear //=> 52
       * @type {number}
       */
      get weeksInWeekYear() {
        return this.isValid ? weeksInWeekYear(this.weekYear) : NaN;
      }
      /**
       * Returns the number of weeks in this DateTime's local week year
       * @example DateTime.local(2020, 6, {locale: 'en-US'}).weeksInLocalWeekYear //=> 52
       * @example DateTime.local(2020, 6, {locale: 'de-DE'}).weeksInLocalWeekYear //=> 53
       * @type {number}
       */
      get weeksInLocalWeekYear() {
        return this.isValid ? weeksInWeekYear(this.localWeekYear, this.loc.getMinDaysInFirstWeek(), this.loc.getStartOfWeek()) : NaN;
      }
      /**
       * Returns the resolved Intl options for this DateTime.
       * This is useful in understanding the behavior of formatting methods
       * @param {Object} opts - the same options as toLocaleString
       * @return {Object}
       */
      resolvedLocaleOptions(opts = {}) {
        const {
          locale,
          numberingSystem,
          calendar
        } = Formatter.create(this.loc.clone(opts), opts).resolvedOptions(this);
        return {
          locale,
          numberingSystem,
          outputCalendar: calendar
        };
      }
      // TRANSFORM
      /**
       * "Set" the DateTime's zone to UTC. Returns a newly-constructed DateTime.
       *
       * Equivalent to {@link DateTime#setZone}('utc')
       * @param {number} [offset=0] - optionally, an offset from UTC in minutes
       * @param {Object} [opts={}] - options to pass to `setZone()`
       * @return {DateTime}
       */
      toUTC(offset2 = 0, opts = {}) {
        return this.setZone(FixedOffsetZone.instance(offset2), opts);
      }
      /**
       * "Set" the DateTime's zone to the host's local zone. Returns a newly-constructed DateTime.
       *
       * Equivalent to `setZone('local')`
       * @return {DateTime}
       */
      toLocal() {
        return this.setZone(Settings.defaultZone);
      }
      /**
       * "Set" the DateTime's zone to specified zone. Returns a newly-constructed DateTime.
       *
       * By default, the setter keeps the underlying time the same (as in, the same timestamp), but the new instance will report different local times and consider DSTs when making computations, as with {@link DateTime#plus}. You may wish to use {@link DateTime#toLocal} and {@link DateTime#toUTC} which provide simple convenience wrappers for commonly used zones.
       * @param {string|Zone} [zone='local'] - a zone identifier. As a string, that can be any IANA zone supported by the host environment, or a fixed-offset name of the form 'UTC+3', or the strings 'local' or 'utc'. You may also supply an instance of a {@link DateTime#Zone} class.
       * @param {Object} opts - options
       * @param {boolean} [opts.keepLocalTime=false] - If true, adjust the underlying time so that the local time stays the same, but in the target zone. You should rarely need this.
       * @return {DateTime}
       */
      setZone(zone, {
        keepLocalTime = false,
        keepCalendarTime = false
      } = {}) {
        zone = normalizeZone(zone, Settings.defaultZone);
        if (zone.equals(this.zone)) {
          return this;
        } else if (!zone.isValid) {
          return _DateTime.invalid(unsupportedZone(zone));
        } else {
          let newTS = this.ts;
          if (keepLocalTime || keepCalendarTime) {
            const offsetGuess = zone.offset(this.ts);
            const asObj = this.toObject();
            [newTS] = objToTS(asObj, offsetGuess, zone);
          }
          return clone(this, {
            ts: newTS,
            zone
          });
        }
      }
      /**
       * "Set" the locale, numberingSystem, or outputCalendar. Returns a newly-constructed DateTime.
       * @param {Object} properties - the properties to set
       * @example DateTime.local(2017, 5, 25).reconfigure({ locale: 'en-GB' })
       * @return {DateTime}
       */
      reconfigure({
        locale,
        numberingSystem,
        outputCalendar
      } = {}) {
        const loc = this.loc.clone({
          locale,
          numberingSystem,
          outputCalendar
        });
        return clone(this, {
          loc
        });
      }
      /**
       * "Set" the locale. Returns a newly-constructed DateTime.
       * Just a convenient alias for reconfigure({ locale })
       * @example DateTime.local(2017, 5, 25).setLocale('en-GB')
       * @return {DateTime}
       */
      setLocale(locale) {
        return this.reconfigure({
          locale
        });
      }
      /**
       * "Set" the values of specified units. Returns a newly-constructed DateTime.
       * You can only set units with this method; for "setting" metadata, see {@link DateTime#reconfigure} and {@link DateTime#setZone}.
       *
       * This method also supports setting locale-based week units, i.e. `localWeekday`, `localWeekNumber` and `localWeekYear`.
       * They cannot be mixed with ISO-week units like `weekday`.
       * @param {Object} values - a mapping of units to numbers
       * @example dt.set({ year: 2017 })
       * @example dt.set({ hour: 8, minute: 30 })
       * @example dt.set({ weekday: 5 })
       * @example dt.set({ year: 2005, ordinal: 234 })
       * @return {DateTime}
       */
      set(values) {
        if (!this.isValid) return this;
        const normalized = normalizeObject(values, normalizeUnitWithLocalWeeks);
        const {
          minDaysInFirstWeek,
          startOfWeek
        } = usesLocalWeekValues(normalized, this.loc);
        const settingWeekStuff = !isUndefined(normalized.weekYear) || !isUndefined(normalized.weekNumber) || !isUndefined(normalized.weekday), containsOrdinal = !isUndefined(normalized.ordinal), containsGregorYear = !isUndefined(normalized.year), containsGregorMD = !isUndefined(normalized.month) || !isUndefined(normalized.day), containsGregor = containsGregorYear || containsGregorMD, definiteWeekDef = normalized.weekYear || normalized.weekNumber;
        if ((containsGregor || containsOrdinal) && definiteWeekDef) {
          throw new ConflictingSpecificationError("Can't mix weekYear/weekNumber units with year/month/day or ordinals");
        }
        if (containsGregorMD && containsOrdinal) {
          throw new ConflictingSpecificationError("Can't mix ordinal dates with month/day");
        }
        let mixed;
        if (settingWeekStuff) {
          mixed = weekToGregorian({
            ...gregorianToWeek(this.c, minDaysInFirstWeek, startOfWeek),
            ...normalized
          }, minDaysInFirstWeek, startOfWeek);
        } else if (!isUndefined(normalized.ordinal)) {
          mixed = ordinalToGregorian({
            ...gregorianToOrdinal(this.c),
            ...normalized
          });
        } else {
          mixed = {
            ...this.toObject(),
            ...normalized
          };
          if (isUndefined(normalized.day)) {
            mixed.day = Math.min(daysInMonth(mixed.year, mixed.month), mixed.day);
          }
        }
        const [ts, o] = objToTS(mixed, this.o, this.zone);
        return clone(this, {
          ts,
          o
        });
      }
      /**
       * Add a period of time to this DateTime and return the resulting DateTime
       *
       * Adding hours, minutes, seconds, or milliseconds increases the timestamp by the right number of milliseconds. Adding days, months, or years shifts the calendar, accounting for DSTs and leap years along the way. Thus, `dt.plus({ hours: 24 })` may result in a different time than `dt.plus({ days: 1 })` if there's a DST shift in between.
       * @param {Duration|Object|number} duration - The amount to add. Either a Luxon Duration, a number of milliseconds, the object argument to Duration.fromObject()
       * @example DateTime.now().plus(123) //~> in 123 milliseconds
       * @example DateTime.now().plus({ minutes: 15 }) //~> in 15 minutes
       * @example DateTime.now().plus({ days: 1 }) //~> this time tomorrow
       * @example DateTime.now().plus({ days: -1 }) //~> this time yesterday
       * @example DateTime.now().plus({ hours: 3, minutes: 13 }) //~> in 3 hr, 13 min
       * @example DateTime.now().plus(Duration.fromObject({ hours: 3, minutes: 13 })) //~> in 3 hr, 13 min
       * @return {DateTime}
       */
      plus(duration) {
        if (!this.isValid) return this;
        const dur = Duration.fromDurationLike(duration);
        return clone(this, adjustTime(this, dur));
      }
      /**
       * Subtract a period of time to this DateTime and return the resulting DateTime
       * See {@link DateTime#plus}
       * @param {Duration|Object|number} duration - The amount to subtract. Either a Luxon Duration, a number of milliseconds, the object argument to Duration.fromObject()
       @return {DateTime}
       */
      minus(duration) {
        if (!this.isValid) return this;
        const dur = Duration.fromDurationLike(duration).negate();
        return clone(this, adjustTime(this, dur));
      }
      /**
       * "Set" this DateTime to the beginning of a unit of time.
       * @param {string} unit - The unit to go to the beginning of. Can be 'year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', or 'millisecond'.
       * @param {Object} opts - options
       * @param {boolean} [opts.useLocaleWeeks=false] - If true, use weeks based on the locale, i.e. use the locale-dependent start of the week
       * @example DateTime.local(2014, 3, 3).startOf('month').toISODate(); //=> '2014-03-01'
       * @example DateTime.local(2014, 3, 3).startOf('year').toISODate(); //=> '2014-01-01'
       * @example DateTime.local(2014, 3, 3).startOf('week').toISODate(); //=> '2014-03-03', weeks always start on Mondays
       * @example DateTime.local(2014, 3, 3, 5, 30).startOf('day').toISOTime(); //=> '00:00.000-05:00'
       * @example DateTime.local(2014, 3, 3, 5, 30).startOf('hour').toISOTime(); //=> '05:00:00.000-05:00'
       * @return {DateTime}
       */
      startOf(unit, {
        useLocaleWeeks = false
      } = {}) {
        if (!this.isValid) return this;
        const o = {}, normalizedUnit = Duration.normalizeUnit(unit);
        switch (normalizedUnit) {
          case "years":
            o.month = 1;
          // falls through
          case "quarters":
          case "months":
            o.day = 1;
          // falls through
          case "weeks":
          case "days":
            o.hour = 0;
          // falls through
          case "hours":
            o.minute = 0;
          // falls through
          case "minutes":
            o.second = 0;
          // falls through
          case "seconds":
            o.millisecond = 0;
            break;
        }
        if (normalizedUnit === "weeks") {
          if (useLocaleWeeks) {
            const startOfWeek = this.loc.getStartOfWeek();
            const {
              weekday
            } = this;
            if (weekday < startOfWeek) {
              o.weekNumber = this.weekNumber - 1;
            }
            o.weekday = startOfWeek;
          } else {
            o.weekday = 1;
          }
        }
        if (normalizedUnit === "quarters") {
          const q = Math.ceil(this.month / 3);
          o.month = (q - 1) * 3 + 1;
        }
        return this.set(o);
      }
      /**
       * "Set" this DateTime to the end (meaning the last millisecond) of a unit of time
       * @param {string} unit - The unit to go to the end of. Can be 'year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', or 'millisecond'.
       * @param {Object} opts - options
       * @param {boolean} [opts.useLocaleWeeks=false] - If true, use weeks based on the locale, i.e. use the locale-dependent start of the week
       * @example DateTime.local(2014, 3, 3).endOf('month').toISO(); //=> '2014-03-31T23:59:59.999-05:00'
       * @example DateTime.local(2014, 3, 3).endOf('year').toISO(); //=> '2014-12-31T23:59:59.999-05:00'
       * @example DateTime.local(2014, 3, 3).endOf('week').toISO(); // => '2014-03-09T23:59:59.999-05:00', weeks start on Mondays
       * @example DateTime.local(2014, 3, 3, 5, 30).endOf('day').toISO(); //=> '2014-03-03T23:59:59.999-05:00'
       * @example DateTime.local(2014, 3, 3, 5, 30).endOf('hour').toISO(); //=> '2014-03-03T05:59:59.999-05:00'
       * @return {DateTime}
       */
      endOf(unit, opts) {
        return this.isValid ? this.plus({
          [unit]: 1
        }).startOf(unit, opts).minus(1) : this;
      }
      // OUTPUT
      /**
       * Returns a string representation of this DateTime formatted according to the specified format string.
       * **You may not want this.** See {@link DateTime#toLocaleString} for a more flexible formatting tool. For a table of tokens and their interpretations, see [here](https://moment.github.io/luxon/#/formatting?id=table-of-tokens).
       * Defaults to en-US if no locale has been specified, regardless of the system's locale.
       * @param {string} fmt - the format string
       * @param {Object} opts - opts to override the configuration options on this DateTime
       * @example DateTime.now().toFormat('yyyy LLL dd') //=> '2017 Apr 22'
       * @example DateTime.now().setLocale('fr').toFormat('yyyy LLL dd') //=> '2017 avr. 22'
       * @example DateTime.now().toFormat('yyyy LLL dd', { locale: "fr" }) //=> '2017 avr. 22'
       * @example DateTime.now().toFormat("HH 'hours and' mm 'minutes'") //=> '20 hours and 55 minutes'
       * @return {string}
       */
      toFormat(fmt, opts = {}) {
        return this.isValid ? Formatter.create(this.loc.redefaultToEN(opts)).formatDateTimeFromString(this, fmt) : INVALID;
      }
      /**
       * Returns a localized string representing this date. Accepts the same options as the Intl.DateTimeFormat constructor and any presets defined by Luxon, such as `DateTime.DATE_FULL` or `DateTime.TIME_SIMPLE`.
       * The exact behavior of this method is browser-specific, but in general it will return an appropriate representation
       * of the DateTime in the assigned locale.
       * Defaults to the system's locale if no locale has been specified
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
       * @param formatOpts {Object} - Intl.DateTimeFormat constructor options and configuration options
       * @param {Object} opts - opts to override the configuration options on this DateTime
       * @example DateTime.now().toLocaleString(); //=> 4/20/2017
       * @example DateTime.now().setLocale('en-gb').toLocaleString(); //=> '20/04/2017'
       * @example DateTime.now().toLocaleString(DateTime.DATE_FULL); //=> 'April 20, 2017'
       * @example DateTime.now().toLocaleString(DateTime.DATE_FULL, { locale: 'fr' }); //=> '28 août 2022'
       * @example DateTime.now().toLocaleString(DateTime.TIME_SIMPLE); //=> '11:32 AM'
       * @example DateTime.now().toLocaleString(DateTime.DATETIME_SHORT); //=> '4/20/2017, 11:32 AM'
       * @example DateTime.now().toLocaleString({ weekday: 'long', month: 'long', day: '2-digit' }); //=> 'Thursday, April 20'
       * @example DateTime.now().toLocaleString({ weekday: 'short', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }); //=> 'Thu, Apr 20, 11:27 AM'
       * @example DateTime.now().toLocaleString({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); //=> '11:32'
       * @return {string}
       */
      toLocaleString(formatOpts = DATE_SHORT, opts = {}) {
        return this.isValid ? Formatter.create(this.loc.clone(opts), formatOpts).formatDateTime(this) : INVALID;
      }
      /**
       * Returns an array of format "parts", meaning individual tokens along with metadata. This is allows callers to post-process individual sections of the formatted output.
       * Defaults to the system's locale if no locale has been specified
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat/formatToParts
       * @param opts {Object} - Intl.DateTimeFormat constructor options, same as `toLocaleString`.
       * @example DateTime.now().toLocaleParts(); //=> [
       *                                   //=>   { type: 'day', value: '25' },
       *                                   //=>   { type: 'literal', value: '/' },
       *                                   //=>   { type: 'month', value: '05' },
       *                                   //=>   { type: 'literal', value: '/' },
       *                                   //=>   { type: 'year', value: '1982' }
       *                                   //=> ]
       */
      toLocaleParts(opts = {}) {
        return this.isValid ? Formatter.create(this.loc.clone(opts), opts).formatDateTimeParts(this) : [];
      }
      /**
       * Returns an ISO 8601-compliant string representation of this DateTime
       * @param {Object} opts - options
       * @param {boolean} [opts.suppressMilliseconds=false] - exclude milliseconds from the format if they're 0
       * @param {boolean} [opts.suppressSeconds=false] - exclude seconds from the format if they're 0
       * @param {boolean} [opts.includeOffset=true] - include the offset, such as 'Z' or '-04:00'
       * @param {boolean} [opts.extendedZone=false] - add the time zone format extension
       * @param {string} [opts.format='extended'] - choose between the basic and extended format
       * @param {string} [opts.precision='milliseconds'] - truncate output to desired presicion: 'years', 'months', 'days', 'hours', 'minutes', 'seconds' or 'milliseconds'. When precision and suppressSeconds or suppressMilliseconds are used together, precision sets the maximum unit shown in the output, however seconds or milliseconds will still be suppressed if they are 0.
       * @example DateTime.utc(1983, 5, 25).toISO() //=> '1982-05-25T00:00:00.000Z'
       * @example DateTime.now().toISO() //=> '2017-04-22T20:47:05.335-04:00'
       * @example DateTime.now().toISO({ includeOffset: false }) //=> '2017-04-22T20:47:05.335'
       * @example DateTime.now().toISO({ format: 'basic' }) //=> '20170422T204705.335-0400'
       * @example DateTime.now().toISO({ precision: 'day' }) //=> '2017-04-22Z'
       * @example DateTime.now().toISO({ precision: 'minute' }) //=> '2017-04-22T20:47Z'
       * @return {string|null}
       */
      toISO({
        format = "extended",
        suppressSeconds = false,
        suppressMilliseconds = false,
        includeOffset = true,
        extendedZone = false,
        precision = "milliseconds"
      } = {}) {
        if (!this.isValid) {
          return null;
        }
        precision = normalizeUnit(precision);
        const ext = format === "extended";
        let c = toISODate(this, ext, precision);
        if (orderedUnits.indexOf(precision) >= 3) c += "T";
        c += toISOTime(this, ext, suppressSeconds, suppressMilliseconds, includeOffset, extendedZone, precision);
        return c;
      }
      /**
       * Returns an ISO 8601-compliant string representation of this DateTime's date component
       * @param {Object} opts - options
       * @param {string} [opts.format='extended'] - choose between the basic and extended format
       * @param {string} [opts.precision='day'] - truncate output to desired precision: 'years', 'months', or 'days'.
       * @example DateTime.utc(1982, 5, 25).toISODate() //=> '1982-05-25'
       * @example DateTime.utc(1982, 5, 25).toISODate({ format: 'basic' }) //=> '19820525'
       * @example DateTime.utc(1982, 5, 25).toISODate({ precision: 'month' }) //=> '1982-05'
       * @return {string|null}
       */
      toISODate({
        format = "extended",
        precision = "day"
      } = {}) {
        if (!this.isValid) {
          return null;
        }
        return toISODate(this, format === "extended", normalizeUnit(precision));
      }
      /**
       * Returns an ISO 8601-compliant string representation of this DateTime's week date
       * @example DateTime.utc(1982, 5, 25).toISOWeekDate() //=> '1982-W21-2'
       * @return {string}
       */
      toISOWeekDate() {
        return toTechFormat(this, "kkkk-'W'WW-c");
      }
      /**
       * Returns an ISO 8601-compliant string representation of this DateTime's time component
       * @param {Object} opts - options
       * @param {boolean} [opts.suppressMilliseconds=false] - exclude milliseconds from the format if they're 0
       * @param {boolean} [opts.suppressSeconds=false] - exclude seconds from the format if they're 0
       * @param {boolean} [opts.includeOffset=true] - include the offset, such as 'Z' or '-04:00'
       * @param {boolean} [opts.extendedZone=true] - add the time zone format extension
       * @param {boolean} [opts.includePrefix=false] - include the `T` prefix
       * @param {string} [opts.format='extended'] - choose between the basic and extended format
       * @param {string} [opts.precision='milliseconds'] - truncate output to desired presicion: 'hours', 'minutes', 'seconds' or 'milliseconds'. When precision and suppressSeconds or suppressMilliseconds are used together, precision sets the maximum unit shown in the output, however seconds or milliseconds will still be suppressed if they are 0.
       * @example DateTime.utc().set({ hour: 7, minute: 34 }).toISOTime() //=> '07:34:19.361Z'
       * @example DateTime.utc().set({ hour: 7, minute: 34, seconds: 0, milliseconds: 0 }).toISOTime({ suppressSeconds: true }) //=> '07:34Z'
       * @example DateTime.utc().set({ hour: 7, minute: 34 }).toISOTime({ format: 'basic' }) //=> '073419.361Z'
       * @example DateTime.utc().set({ hour: 7, minute: 34 }).toISOTime({ includePrefix: true }) //=> 'T07:34:19.361Z'
       * @example DateTime.utc().set({ hour: 7, minute: 34, second: 56 }).toISOTime({ precision: 'minute' }) //=> '07:34Z'
       * @return {string}
       */
      toISOTime({
        suppressMilliseconds = false,
        suppressSeconds = false,
        includeOffset = true,
        includePrefix = false,
        extendedZone = false,
        format = "extended",
        precision = "milliseconds"
      } = {}) {
        if (!this.isValid) {
          return null;
        }
        precision = normalizeUnit(precision);
        let c = includePrefix && orderedUnits.indexOf(precision) >= 3 ? "T" : "";
        return c + toISOTime(this, format === "extended", suppressSeconds, suppressMilliseconds, includeOffset, extendedZone, precision);
      }
      /**
       * Returns an RFC 2822-compatible string representation of this DateTime
       * @example DateTime.utc(2014, 7, 13).toRFC2822() //=> 'Sun, 13 Jul 2014 00:00:00 +0000'
       * @example DateTime.local(2014, 7, 13).toRFC2822() //=> 'Sun, 13 Jul 2014 00:00:00 -0400'
       * @return {string}
       */
      toRFC2822() {
        return toTechFormat(this, "EEE, dd LLL yyyy HH:mm:ss ZZZ", false);
      }
      /**
       * Returns a string representation of this DateTime appropriate for use in HTTP headers. The output is always expressed in GMT.
       * Specifically, the string conforms to RFC 1123.
       * @see https://www.w3.org/Protocols/rfc2616/rfc2616-sec3.html#sec3.3.1
       * @example DateTime.utc(2014, 7, 13).toHTTP() //=> 'Sun, 13 Jul 2014 00:00:00 GMT'
       * @example DateTime.utc(2014, 7, 13, 19).toHTTP() //=> 'Sun, 13 Jul 2014 19:00:00 GMT'
       * @return {string}
       */
      toHTTP() {
        return toTechFormat(this.toUTC(), "EEE, dd LLL yyyy HH:mm:ss 'GMT'");
      }
      /**
       * Returns a string representation of this DateTime appropriate for use in SQL Date
       * @example DateTime.utc(2014, 7, 13).toSQLDate() //=> '2014-07-13'
       * @return {string|null}
       */
      toSQLDate() {
        if (!this.isValid) {
          return null;
        }
        return toISODate(this, true);
      }
      /**
       * Returns a string representation of this DateTime appropriate for use in SQL Time
       * @param {Object} opts - options
       * @param {boolean} [opts.includeZone=false] - include the zone, such as 'America/New_York'. Overrides includeOffset.
       * @param {boolean} [opts.includeOffset=true] - include the offset, such as 'Z' or '-04:00'
       * @param {boolean} [opts.includeOffsetSpace=true] - include the space between the time and the offset, such as '05:15:16.345 -04:00'
       * @example DateTime.utc().toSQL() //=> '05:15:16.345'
       * @example DateTime.now().toSQL() //=> '05:15:16.345 -04:00'
       * @example DateTime.now().toSQL({ includeOffset: false }) //=> '05:15:16.345'
       * @example DateTime.now().toSQL({ includeZone: false }) //=> '05:15:16.345 America/New_York'
       * @return {string}
       */
      toSQLTime({
        includeOffset = true,
        includeZone = false,
        includeOffsetSpace = true
      } = {}) {
        let fmt = "HH:mm:ss.SSS";
        if (includeZone || includeOffset) {
          if (includeOffsetSpace) {
            fmt += " ";
          }
          if (includeZone) {
            fmt += "z";
          } else if (includeOffset) {
            fmt += "ZZ";
          }
        }
        return toTechFormat(this, fmt, true);
      }
      /**
       * Returns a string representation of this DateTime appropriate for use in SQL DateTime
       * @param {Object} opts - options
       * @param {boolean} [opts.includeZone=false] - include the zone, such as 'America/New_York'. Overrides includeOffset.
       * @param {boolean} [opts.includeOffset=true] - include the offset, such as 'Z' or '-04:00'
       * @param {boolean} [opts.includeOffsetSpace=true] - include the space between the time and the offset, such as '05:15:16.345 -04:00'
       * @example DateTime.utc(2014, 7, 13).toSQL() //=> '2014-07-13 00:00:00.000 Z'
       * @example DateTime.local(2014, 7, 13).toSQL() //=> '2014-07-13 00:00:00.000 -04:00'
       * @example DateTime.local(2014, 7, 13).toSQL({ includeOffset: false }) //=> '2014-07-13 00:00:00.000'
       * @example DateTime.local(2014, 7, 13).toSQL({ includeZone: true }) //=> '2014-07-13 00:00:00.000 America/New_York'
       * @return {string}
       */
      toSQL(opts = {}) {
        if (!this.isValid) {
          return null;
        }
        return `${this.toSQLDate()} ${this.toSQLTime(opts)}`;
      }
      /**
       * Returns a string representation of this DateTime appropriate for debugging
       * @return {string}
       */
      toString() {
        return this.isValid ? this.toISO() : INVALID;
      }
      /**
       * Returns a string representation of this DateTime appropriate for the REPL.
       * @return {string}
       */
      [Symbol.for("nodejs.util.inspect.custom")]() {
        if (this.isValid) {
          return `DateTime { ts: ${this.toISO()}, zone: ${this.zone.name}, locale: ${this.locale} }`;
        } else {
          return `DateTime { Invalid, reason: ${this.invalidReason} }`;
        }
      }
      /**
       * Returns the epoch milliseconds of this DateTime. Alias of {@link DateTime#toMillis}
       * @return {number}
       */
      valueOf() {
        return this.toMillis();
      }
      /**
       * Returns the epoch milliseconds of this DateTime.
       * @return {number}
       */
      toMillis() {
        return this.isValid ? this.ts : NaN;
      }
      /**
       * Returns the epoch seconds (including milliseconds in the fractional part) of this DateTime.
       * @return {number}
       */
      toSeconds() {
        return this.isValid ? this.ts / 1e3 : NaN;
      }
      /**
       * Returns the epoch seconds (as a whole number) of this DateTime.
       * @return {number}
       */
      toUnixInteger() {
        return this.isValid ? Math.floor(this.ts / 1e3) : NaN;
      }
      /**
       * Returns an ISO 8601 representation of this DateTime appropriate for use in JSON.
       * @return {string}
       */
      toJSON() {
        return this.toISO();
      }
      /**
       * Returns a BSON serializable equivalent to this DateTime.
       * @return {Date}
       */
      toBSON() {
        return this.toJSDate();
      }
      /**
       * Returns a JavaScript object with this DateTime's year, month, day, and so on.
       * @param opts - options for generating the object
       * @param {boolean} [opts.includeConfig=false] - include configuration attributes in the output
       * @example DateTime.now().toObject() //=> { year: 2017, month: 4, day: 22, hour: 20, minute: 49, second: 42, millisecond: 268 }
       * @return {Object}
       */
      toObject(opts = {}) {
        if (!this.isValid) return {};
        const base = {
          ...this.c
        };
        if (opts.includeConfig) {
          base.outputCalendar = this.outputCalendar;
          base.numberingSystem = this.loc.numberingSystem;
          base.locale = this.loc.locale;
        }
        return base;
      }
      /**
       * Returns a JavaScript Date equivalent to this DateTime.
       * @return {Date}
       */
      toJSDate() {
        return new Date(this.isValid ? this.ts : NaN);
      }
      // COMPARE
      /**
       * Return the difference between two DateTimes as a Duration.
       * @param {DateTime} otherDateTime - the DateTime to compare this one to
       * @param {string|string[]} [unit=['milliseconds']] - the unit or array of units (such as 'hours' or 'days') to include in the duration.
       * @param {Object} opts - options that affect the creation of the Duration
       * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
       * @example
       * var i1 = DateTime.fromISO('1982-05-25T09:45'),
       *     i2 = DateTime.fromISO('1983-10-14T10:30');
       * i2.diff(i1).toObject() //=> { milliseconds: 43807500000 }
       * i2.diff(i1, 'hours').toObject() //=> { hours: 12168.75 }
       * i2.diff(i1, ['months', 'days']).toObject() //=> { months: 16, days: 19.03125 }
       * i2.diff(i1, ['months', 'days', 'hours']).toObject() //=> { months: 16, days: 19, hours: 0.75 }
       * @return {Duration}
       */
      diff(otherDateTime, unit = "milliseconds", opts = {}) {
        if (!this.isValid || !otherDateTime.isValid) {
          return Duration.invalid("created by diffing an invalid DateTime");
        }
        const durOpts = {
          locale: this.locale,
          numberingSystem: this.numberingSystem,
          ...opts
        };
        const units = maybeArray(unit).map(Duration.normalizeUnit), otherIsLater = otherDateTime.valueOf() > this.valueOf(), earlier = otherIsLater ? this : otherDateTime, later = otherIsLater ? otherDateTime : this, diffed = diff(earlier, later, units, durOpts);
        return otherIsLater ? diffed.negate() : diffed;
      }
      /**
       * Return the difference between this DateTime and right now.
       * See {@link DateTime#diff}
       * @param {string|string[]} [unit=['milliseconds']] - the unit or units units (such as 'hours' or 'days') to include in the duration
       * @param {Object} opts - options that affect the creation of the Duration
       * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
       * @return {Duration}
       */
      diffNow(unit = "milliseconds", opts = {}) {
        return this.diff(_DateTime.now(), unit, opts);
      }
      /**
       * Return an Interval spanning between this DateTime and another DateTime
       * @param {DateTime} otherDateTime - the other end point of the Interval
       * @return {Interval|DateTime}
       */
      until(otherDateTime) {
        return this.isValid ? Interval.fromDateTimes(this, otherDateTime) : this;
      }
      /**
       * Return whether this DateTime is in the same unit of time as another DateTime.
       * Higher-order units must also be identical for this function to return `true`.
       * Note that time zones are **ignored** in this comparison, which compares the **local** calendar time. Use {@link DateTime#setZone} to convert one of the dates if needed.
       * @param {DateTime} otherDateTime - the other DateTime
       * @param {string} unit - the unit of time to check sameness on
       * @param {Object} opts - options
       * @param {boolean} [opts.useLocaleWeeks=false] - If true, use weeks based on the locale, i.e. use the locale-dependent start of the week; only the locale of this DateTime is used
       * @example DateTime.now().hasSame(otherDT, 'day'); //~> true if otherDT is in the same current calendar day
       * @return {boolean}
       */
      hasSame(otherDateTime, unit, opts) {
        if (!this.isValid) return false;
        const inputMs = otherDateTime.valueOf();
        const adjustedToZone = this.setZone(otherDateTime.zone, {
          keepLocalTime: true
        });
        return adjustedToZone.startOf(unit, opts) <= inputMs && inputMs <= adjustedToZone.endOf(unit, opts);
      }
      /**
       * Equality check
       * Two DateTimes are equal if and only if they represent the same millisecond, have the same zone and location, and are both valid.
       * To compare just the millisecond values, use `+dt1 === +dt2`.
       * @param {DateTime} other - the other DateTime
       * @return {boolean}
       */
      equals(other) {
        return this.isValid && other.isValid && this.valueOf() === other.valueOf() && this.zone.equals(other.zone) && this.loc.equals(other.loc);
      }
      /**
       * Returns a string representation of a this time relative to now, such as "in two days". Can only internationalize if your
       * platform supports Intl.RelativeTimeFormat. Rounds towards zero by default.
       * @param {Object} options - options that affect the output
       * @param {DateTime} [options.base=DateTime.now()] - the DateTime to use as the basis to which this time is compared. Defaults to now.
       * @param {string} [options.style="long"] - the style of units, must be "long", "short", or "narrow"
       * @param {string|string[]} options.unit - use a specific unit or array of units; if omitted, or an array, the method will pick the best unit. Use an array or one of "years", "quarters", "months", "weeks", "days", "hours", "minutes", or "seconds"
       * @param {boolean} [options.round=true] - whether to round the numbers in the output.
       * @param {string} [options.rounding="trunc"] - rounding method to use when rounding the numbers in the output. Can be "trunc" (toward zero), "expand" (away from zero), "round", "floor", or "ceil".
       * @param {number} [options.padding=0] - padding in milliseconds. This allows you to round up the result if it fits inside the threshold. Don't use in combination with {round: false} because the decimal output will include the padding.
       * @param {string} options.locale - override the locale of this DateTime
       * @param {string} options.numberingSystem - override the numberingSystem of this DateTime. The Intl system may choose not to honor this
       * @example DateTime.now().plus({ days: 1 }).toRelative() //=> "in 1 day"
       * @example DateTime.now().setLocale("es").toRelative({ days: 1 }) //=> "dentro de 1 día"
       * @example DateTime.now().plus({ days: 1 }).toRelative({ locale: "fr" }) //=> "dans 23 heures"
       * @example DateTime.now().minus({ days: 2 }).toRelative() //=> "2 days ago"
       * @example DateTime.now().minus({ days: 2 }).toRelative({ unit: "hours" }) //=> "48 hours ago"
       * @example DateTime.now().minus({ hours: 36 }).toRelative({ round: false }) //=> "1.5 days ago"
       */
      toRelative(options = {}) {
        if (!this.isValid) return null;
        const base = options.base || _DateTime.fromObject({}, {
          zone: this.zone
        }), padding = options.padding ? this < base ? -options.padding : options.padding : 0;
        let units = ["years", "months", "days", "hours", "minutes", "seconds"];
        let unit = options.unit;
        if (Array.isArray(options.unit)) {
          units = options.unit;
          unit = void 0;
        }
        return diffRelative(base, this.plus(padding), {
          ...options,
          numeric: "always",
          units,
          unit
        });
      }
      /**
       * Returns a string representation of this date relative to today, such as "yesterday" or "next month".
       * Only internationalizes on platforms that supports Intl.RelativeTimeFormat.
       * @param {Object} options - options that affect the output
       * @param {DateTime} [options.base=DateTime.now()] - the DateTime to use as the basis to which this time is compared. Defaults to now.
       * @param {string} options.locale - override the locale of this DateTime
       * @param {string} options.unit - use a specific unit; if omitted, the method will pick the unit. Use one of "years", "quarters", "months", "weeks", or "days"
       * @param {string} options.numberingSystem - override the numberingSystem of this DateTime. The Intl system may choose not to honor this
       * @example DateTime.now().plus({ days: 1 }).toRelativeCalendar() //=> "tomorrow"
       * @example DateTime.now().setLocale("es").plus({ days: 1 }).toRelative() //=> ""mañana"
       * @example DateTime.now().plus({ days: 1 }).toRelativeCalendar({ locale: "fr" }) //=> "demain"
       * @example DateTime.now().minus({ days: 2 }).toRelativeCalendar() //=> "2 days ago"
       */
      toRelativeCalendar(options = {}) {
        if (!this.isValid) return null;
        return diffRelative(options.base || _DateTime.fromObject({}, {
          zone: this.zone
        }), this, {
          ...options,
          numeric: "auto",
          units: ["years", "months", "days"],
          calendary: true
        });
      }
      /**
       * Return the min of several date times
       * @param {...DateTime} dateTimes - the DateTimes from which to choose the minimum
       * @return {DateTime} the min DateTime, or undefined if called with no argument
       */
      static min(...dateTimes) {
        if (!dateTimes.every(_DateTime.isDateTime)) {
          throw new InvalidArgumentError("min requires all arguments be DateTimes");
        }
        return bestBy(dateTimes, (i) => i.valueOf(), Math.min);
      }
      /**
       * Return the max of several date times
       * @param {...DateTime} dateTimes - the DateTimes from which to choose the maximum
       * @return {DateTime} the max DateTime, or undefined if called with no argument
       */
      static max(...dateTimes) {
        if (!dateTimes.every(_DateTime.isDateTime)) {
          throw new InvalidArgumentError("max requires all arguments be DateTimes");
        }
        return bestBy(dateTimes, (i) => i.valueOf(), Math.max);
      }
      // MISC
      /**
       * Explain how a string would be parsed by fromFormat()
       * @param {string} text - the string to parse
       * @param {string} fmt - the format the string is expected to be in (see description)
       * @param {Object} options - options taken by fromFormat()
       * @return {Object}
       */
      static fromFormatExplain(text, fmt, options = {}) {
        const {
          locale = null,
          numberingSystem = null
        } = options, localeToUse = Locale.fromOpts({
          locale,
          numberingSystem,
          defaultToEN: true
        });
        return explainFromTokens(localeToUse, text, fmt);
      }
      /**
       * @deprecated use fromFormatExplain instead
       */
      static fromStringExplain(text, fmt, options = {}) {
        return _DateTime.fromFormatExplain(text, fmt, options);
      }
      /**
       * Build a parser for `fmt` using the given locale. This parser can be passed
       * to {@link DateTime.fromFormatParser} to a parse a date in this format. This
       * can be used to optimize cases where many dates need to be parsed in a
       * specific format.
       *
       * @param {String} fmt - the format the string is expected to be in (see
       * description)
       * @param {Object} options - options used to set locale and numberingSystem
       * for parser
       * @returns {TokenParser} - opaque object to be used
       */
      static buildFormatParser(fmt, options = {}) {
        const {
          locale = null,
          numberingSystem = null
        } = options, localeToUse = Locale.fromOpts({
          locale,
          numberingSystem,
          defaultToEN: true
        });
        return new TokenParser(localeToUse, fmt);
      }
      /**
       * Create a DateTime from an input string and format parser.
       *
       * The format parser must have been created with the same locale as this call.
       *
       * @param {String} text - the string to parse
       * @param {TokenParser} formatParser - parser from {@link DateTime.buildFormatParser}
       * @param {Object} opts - options taken by fromFormat()
       * @returns {DateTime}
       */
      static fromFormatParser(text, formatParser, opts = {}) {
        if (isUndefined(text) || isUndefined(formatParser)) {
          throw new InvalidArgumentError("fromFormatParser requires an input string and a format parser");
        }
        const {
          locale = null,
          numberingSystem = null
        } = opts, localeToUse = Locale.fromOpts({
          locale,
          numberingSystem,
          defaultToEN: true
        });
        if (!localeToUse.equals(formatParser.locale)) {
          throw new InvalidArgumentError(`fromFormatParser called with a locale of ${localeToUse}, but the format parser was created for ${formatParser.locale}`);
        }
        const {
          result,
          zone,
          specificOffset,
          invalidReason
        } = formatParser.explainFromTokens(text);
        if (invalidReason) {
          return _DateTime.invalid(invalidReason);
        } else {
          return parseDataToDateTime(result, zone, opts, `format ${formatParser.format}`, text, specificOffset);
        }
      }
      // FORMAT PRESETS
      /**
       * {@link DateTime#toLocaleString} format like 10/14/1983
       * @type {Object}
       */
      static get DATE_SHORT() {
        return DATE_SHORT;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'Oct 14, 1983'
       * @type {Object}
       */
      static get DATE_MED() {
        return DATE_MED;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'Fri, Oct 14, 1983'
       * @type {Object}
       */
      static get DATE_MED_WITH_WEEKDAY() {
        return DATE_MED_WITH_WEEKDAY;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'October 14, 1983'
       * @type {Object}
       */
      static get DATE_FULL() {
        return DATE_FULL;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'Tuesday, October 14, 1983'
       * @type {Object}
       */
      static get DATE_HUGE() {
        return DATE_HUGE;
      }
      /**
       * {@link DateTime#toLocaleString} format like '09:30 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get TIME_SIMPLE() {
        return TIME_SIMPLE;
      }
      /**
       * {@link DateTime#toLocaleString} format like '09:30:23 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get TIME_WITH_SECONDS() {
        return TIME_WITH_SECONDS;
      }
      /**
       * {@link DateTime#toLocaleString} format like '09:30:23 AM EDT'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get TIME_WITH_SHORT_OFFSET() {
        return TIME_WITH_SHORT_OFFSET;
      }
      /**
       * {@link DateTime#toLocaleString} format like '09:30:23 AM Eastern Daylight Time'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get TIME_WITH_LONG_OFFSET() {
        return TIME_WITH_LONG_OFFSET;
      }
      /**
       * {@link DateTime#toLocaleString} format like '09:30', always 24-hour.
       * @type {Object}
       */
      static get TIME_24_SIMPLE() {
        return TIME_24_SIMPLE;
      }
      /**
       * {@link DateTime#toLocaleString} format like '09:30:23', always 24-hour.
       * @type {Object}
       */
      static get TIME_24_WITH_SECONDS() {
        return TIME_24_WITH_SECONDS;
      }
      /**
       * {@link DateTime#toLocaleString} format like '09:30:23 EDT', always 24-hour.
       * @type {Object}
       */
      static get TIME_24_WITH_SHORT_OFFSET() {
        return TIME_24_WITH_SHORT_OFFSET;
      }
      /**
       * {@link DateTime#toLocaleString} format like '09:30:23 Eastern Daylight Time', always 24-hour.
       * @type {Object}
       */
      static get TIME_24_WITH_LONG_OFFSET() {
        return TIME_24_WITH_LONG_OFFSET;
      }
      /**
       * {@link DateTime#toLocaleString} format like '10/14/1983, 9:30 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_SHORT() {
        return DATETIME_SHORT;
      }
      /**
       * {@link DateTime#toLocaleString} format like '10/14/1983, 9:30:33 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_SHORT_WITH_SECONDS() {
        return DATETIME_SHORT_WITH_SECONDS;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'Oct 14, 1983, 9:30 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_MED() {
        return DATETIME_MED;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'Oct 14, 1983, 9:30:33 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_MED_WITH_SECONDS() {
        return DATETIME_MED_WITH_SECONDS;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'Fri, 14 Oct 1983, 9:30 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_MED_WITH_WEEKDAY() {
        return DATETIME_MED_WITH_WEEKDAY;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'October 14, 1983, 9:30 AM EDT'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_FULL() {
        return DATETIME_FULL;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'October 14, 1983, 9:30:33 AM EDT'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_FULL_WITH_SECONDS() {
        return DATETIME_FULL_WITH_SECONDS;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'Friday, October 14, 1983, 9:30 AM Eastern Daylight Time'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_HUGE() {
        return DATETIME_HUGE;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'Friday, October 14, 1983, 9:30:33 AM Eastern Daylight Time'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_HUGE_WITH_SECONDS() {
        return DATETIME_HUGE_WITH_SECONDS;
      }
    };
    function friendlyDateTime(dateTimeish) {
      if (DateTime.isDateTime(dateTimeish)) {
        return dateTimeish;
      } else if (dateTimeish && dateTimeish.valueOf && isNumber(dateTimeish.valueOf())) {
        return DateTime.fromJSDate(dateTimeish);
      } else if (dateTimeish && typeof dateTimeish === "object") {
        return DateTime.fromObject(dateTimeish);
      } else {
        throw new InvalidArgumentError(`Unknown datetime argument: ${dateTimeish}, of type ${typeof dateTimeish}`);
      }
    }
    var VERSION = "3.7.2";
    exports.DateTime = DateTime;
    exports.Duration = Duration;
    exports.FixedOffsetZone = FixedOffsetZone;
    exports.IANAZone = IANAZone;
    exports.Info = Info;
    exports.Interval = Interval;
    exports.InvalidZone = InvalidZone;
    exports.Settings = Settings;
    exports.SystemZone = SystemZone;
    exports.VERSION = VERSION;
    exports.Zone = Zone;
  }
});

// node_modules/cron-parser/lib/date.js
var require_date = __commonJS({
  "node_modules/cron-parser/lib/date.js"(exports, module) {
    "use strict";
    var luxon = require_luxon();
    CronDate.prototype.addYear = function() {
      this._date = this._date.plus({ years: 1 });
    };
    CronDate.prototype.addMonth = function() {
      this._date = this._date.plus({ months: 1 }).startOf("month");
    };
    CronDate.prototype.addDay = function() {
      this._date = this._date.plus({ days: 1 }).startOf("day");
    };
    CronDate.prototype.addHour = function() {
      var prev = this._date;
      this._date = this._date.plus({ hours: 1 }).startOf("hour");
      if (this._date <= prev) {
        this._date = this._date.plus({ hours: 1 });
      }
    };
    CronDate.prototype.addMinute = function() {
      var prev = this._date;
      this._date = this._date.plus({ minutes: 1 }).startOf("minute");
      if (this._date < prev) {
        this._date = this._date.plus({ hours: 1 });
      }
    };
    CronDate.prototype.addSecond = function() {
      var prev = this._date;
      this._date = this._date.plus({ seconds: 1 }).startOf("second");
      if (this._date < prev) {
        this._date = this._date.plus({ hours: 1 });
      }
    };
    CronDate.prototype.subtractYear = function() {
      this._date = this._date.minus({ years: 1 });
    };
    CronDate.prototype.subtractMonth = function() {
      this._date = this._date.minus({ months: 1 }).endOf("month").startOf("second");
    };
    CronDate.prototype.subtractDay = function() {
      this._date = this._date.minus({ days: 1 }).endOf("day").startOf("second");
    };
    CronDate.prototype.subtractHour = function() {
      var prev = this._date;
      this._date = this._date.minus({ hours: 1 }).endOf("hour").startOf("second");
      if (this._date >= prev) {
        this._date = this._date.minus({ hours: 1 });
      }
    };
    CronDate.prototype.subtractMinute = function() {
      var prev = this._date;
      this._date = this._date.minus({ minutes: 1 }).endOf("minute").startOf("second");
      if (this._date > prev) {
        this._date = this._date.minus({ hours: 1 });
      }
    };
    CronDate.prototype.subtractSecond = function() {
      var prev = this._date;
      this._date = this._date.minus({ seconds: 1 }).startOf("second");
      if (this._date > prev) {
        this._date = this._date.minus({ hours: 1 });
      }
    };
    CronDate.prototype.getDate = function() {
      return this._date.day;
    };
    CronDate.prototype.getFullYear = function() {
      return this._date.year;
    };
    CronDate.prototype.getDay = function() {
      var weekday = this._date.weekday;
      return weekday == 7 ? 0 : weekday;
    };
    CronDate.prototype.getMonth = function() {
      return this._date.month - 1;
    };
    CronDate.prototype.getHours = function() {
      return this._date.hour;
    };
    CronDate.prototype.getMinutes = function() {
      return this._date.minute;
    };
    CronDate.prototype.getSeconds = function() {
      return this._date.second;
    };
    CronDate.prototype.getMilliseconds = function() {
      return this._date.millisecond;
    };
    CronDate.prototype.getTime = function() {
      return this._date.valueOf();
    };
    CronDate.prototype.getUTCDate = function() {
      return this._getUTC().day;
    };
    CronDate.prototype.getUTCFullYear = function() {
      return this._getUTC().year;
    };
    CronDate.prototype.getUTCDay = function() {
      var weekday = this._getUTC().weekday;
      return weekday == 7 ? 0 : weekday;
    };
    CronDate.prototype.getUTCMonth = function() {
      return this._getUTC().month - 1;
    };
    CronDate.prototype.getUTCHours = function() {
      return this._getUTC().hour;
    };
    CronDate.prototype.getUTCMinutes = function() {
      return this._getUTC().minute;
    };
    CronDate.prototype.getUTCSeconds = function() {
      return this._getUTC().second;
    };
    CronDate.prototype.toISOString = function() {
      return this._date.toUTC().toISO();
    };
    CronDate.prototype.toJSON = function() {
      return this._date.toJSON();
    };
    CronDate.prototype.setDate = function(d) {
      this._date = this._date.set({ day: d });
    };
    CronDate.prototype.setFullYear = function(y) {
      this._date = this._date.set({ year: y });
    };
    CronDate.prototype.setDay = function(d) {
      this._date = this._date.set({ weekday: d });
    };
    CronDate.prototype.setMonth = function(m) {
      this._date = this._date.set({ month: m + 1 });
    };
    CronDate.prototype.setHours = function(h) {
      this._date = this._date.set({ hour: h });
    };
    CronDate.prototype.setMinutes = function(m) {
      this._date = this._date.set({ minute: m });
    };
    CronDate.prototype.setSeconds = function(s) {
      this._date = this._date.set({ second: s });
    };
    CronDate.prototype.setMilliseconds = function(s) {
      this._date = this._date.set({ millisecond: s });
    };
    CronDate.prototype._getUTC = function() {
      return this._date.toUTC();
    };
    CronDate.prototype.toString = function() {
      return this.toDate().toString();
    };
    CronDate.prototype.toDate = function() {
      return this._date.toJSDate();
    };
    CronDate.prototype.isLastDayOfMonth = function() {
      var newDate = this._date.plus({ days: 1 }).startOf("day");
      return this._date.month !== newDate.month;
    };
    CronDate.prototype.isLastWeekdayOfMonth = function() {
      var newDate = this._date.plus({ days: 7 }).startOf("day");
      return this._date.month !== newDate.month;
    };
    function CronDate(timestamp2, tz) {
      var dateOpts = { zone: tz };
      if (!timestamp2) {
        this._date = luxon.DateTime.local();
      } else if (timestamp2 instanceof CronDate) {
        this._date = timestamp2._date;
      } else if (timestamp2 instanceof Date) {
        this._date = luxon.DateTime.fromJSDate(timestamp2, dateOpts);
      } else if (typeof timestamp2 === "number") {
        this._date = luxon.DateTime.fromMillis(timestamp2, dateOpts);
      } else if (typeof timestamp2 === "string") {
        this._date = luxon.DateTime.fromISO(timestamp2, dateOpts);
        this._date.isValid || (this._date = luxon.DateTime.fromRFC2822(timestamp2, dateOpts));
        this._date.isValid || (this._date = luxon.DateTime.fromSQL(timestamp2, dateOpts));
        this._date.isValid || (this._date = luxon.DateTime.fromFormat(timestamp2, "EEE, d MMM yyyy HH:mm:ss", dateOpts));
      }
      if (!this._date || !this._date.isValid) {
        throw new Error("CronDate: unhandled timestamp: " + JSON.stringify(timestamp2));
      }
      if (tz && tz !== this._date.zoneName) {
        this._date = this._date.setZone(tz);
      }
    }
    module.exports = CronDate;
  }
});

// node_modules/cron-parser/lib/field_compactor.js
var require_field_compactor = __commonJS({
  "node_modules/cron-parser/lib/field_compactor.js"(exports, module) {
    "use strict";
    function buildRange(item) {
      return {
        start: item,
        count: 1
      };
    }
    function completeRangeWithItem(range, item) {
      range.end = item;
      range.step = item - range.start;
      range.count = 2;
    }
    function finalizeCurrentRange(results, currentRange, currentItemRange) {
      if (currentRange) {
        if (currentRange.count === 2) {
          results.push(buildRange(currentRange.start));
          results.push(buildRange(currentRange.end));
        } else {
          results.push(currentRange);
        }
      }
      if (currentItemRange) {
        results.push(currentItemRange);
      }
    }
    function compactField(arr) {
      var results = [];
      var currentRange = void 0;
      for (var i = 0; i < arr.length; i++) {
        var currentItem = arr[i];
        if (typeof currentItem !== "number") {
          finalizeCurrentRange(results, currentRange, buildRange(currentItem));
          currentRange = void 0;
        } else if (!currentRange) {
          currentRange = buildRange(currentItem);
        } else if (currentRange.count === 1) {
          completeRangeWithItem(currentRange, currentItem);
        } else {
          if (currentRange.step === currentItem - currentRange.end) {
            currentRange.count++;
            currentRange.end = currentItem;
          } else if (currentRange.count === 2) {
            results.push(buildRange(currentRange.start));
            currentRange = buildRange(currentRange.end);
            completeRangeWithItem(currentRange, currentItem);
          } else {
            finalizeCurrentRange(results, currentRange);
            currentRange = buildRange(currentItem);
          }
        }
      }
      finalizeCurrentRange(results, currentRange);
      return results;
    }
    module.exports = compactField;
  }
});

// node_modules/cron-parser/lib/field_stringify.js
var require_field_stringify = __commonJS({
  "node_modules/cron-parser/lib/field_stringify.js"(exports, module) {
    "use strict";
    var compactField = require_field_compactor();
    function stringifyField(arr, min, max) {
      var ranges = compactField(arr);
      if (ranges.length === 1) {
        var singleRange = ranges[0];
        var step = singleRange.step;
        if (step === 1 && singleRange.start === min && singleRange.end === max) {
          return "*";
        }
        if (step !== 1 && singleRange.start === min && singleRange.end === max - step + 1) {
          return "*/" + step;
        }
      }
      var result = [];
      for (var i = 0, l = ranges.length; i < l; ++i) {
        var range = ranges[i];
        if (range.count === 1) {
          result.push(range.start);
          continue;
        }
        var step = range.step;
        if (range.step === 1) {
          result.push(range.start + "-" + range.end);
          continue;
        }
        var multiplier = range.start == 0 ? range.count - 1 : range.count;
        if (range.step * multiplier > range.end) {
          result = result.concat(
            Array.from({ length: range.end - range.start + 1 }).map(function(_, index) {
              var value = range.start + index;
              if ((value - range.start) % range.step === 0) {
                return value;
              }
              return null;
            }).filter(function(value) {
              return value != null;
            })
          );
        } else if (range.end === max - range.step + 1) {
          result.push(range.start + "/" + range.step);
        } else {
          result.push(range.start + "-" + range.end + "/" + range.step);
        }
      }
      return result.join(",");
    }
    module.exports = stringifyField;
  }
});

// node_modules/cron-parser/lib/expression.js
var require_expression = __commonJS({
  "node_modules/cron-parser/lib/expression.js"(exports, module) {
    "use strict";
    var CronDate = require_date();
    var stringifyField = require_field_stringify();
    var LOOP_LIMIT = 1e4;
    function CronExpression(fields, options) {
      this._options = options;
      this._utc = options.utc || false;
      this._tz = this._utc ? "UTC" : options.tz;
      this._currentDate = new CronDate(options.currentDate, this._tz);
      this._startDate = options.startDate ? new CronDate(options.startDate, this._tz) : null;
      this._endDate = options.endDate ? new CronDate(options.endDate, this._tz) : null;
      this._isIterator = options.iterator || false;
      this._hasIterated = false;
      this._nthDayOfWeek = options.nthDayOfWeek || 0;
      this.fields = CronExpression._freezeFields(fields);
    }
    CronExpression.map = ["second", "minute", "hour", "dayOfMonth", "month", "dayOfWeek"];
    CronExpression.predefined = {
      "@yearly": "0 0 1 1 *",
      "@monthly": "0 0 1 * *",
      "@weekly": "0 0 * * 0",
      "@daily": "0 0 * * *",
      "@hourly": "0 * * * *"
    };
    CronExpression.constraints = [
      { min: 0, max: 59, chars: [] },
      // Second
      { min: 0, max: 59, chars: [] },
      // Minute
      { min: 0, max: 23, chars: [] },
      // Hour
      { min: 1, max: 31, chars: ["L"] },
      // Day of month
      { min: 1, max: 12, chars: [] },
      // Month
      { min: 0, max: 7, chars: ["L"] }
      // Day of week
    ];
    CronExpression.daysInMonth = [
      31,
      29,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31
    ];
    CronExpression.aliases = {
      month: {
        jan: 1,
        feb: 2,
        mar: 3,
        apr: 4,
        may: 5,
        jun: 6,
        jul: 7,
        aug: 8,
        sep: 9,
        oct: 10,
        nov: 11,
        dec: 12
      },
      dayOfWeek: {
        sun: 0,
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6
      }
    };
    CronExpression.parseDefaults = ["0", "*", "*", "*", "*", "*"];
    CronExpression.standardValidCharacters = /^[,*\d/-]+$/;
    CronExpression.dayOfWeekValidCharacters = /^[?,*\dL#/-]+$/;
    CronExpression.dayOfMonthValidCharacters = /^[?,*\dL/-]+$/;
    CronExpression.validCharacters = {
      second: CronExpression.standardValidCharacters,
      minute: CronExpression.standardValidCharacters,
      hour: CronExpression.standardValidCharacters,
      dayOfMonth: CronExpression.dayOfMonthValidCharacters,
      month: CronExpression.standardValidCharacters,
      dayOfWeek: CronExpression.dayOfWeekValidCharacters
    };
    CronExpression._isValidConstraintChar = function _isValidConstraintChar(constraints, value) {
      if (typeof value !== "string") {
        return false;
      }
      return constraints.chars.some(function(char) {
        return value.indexOf(char) > -1;
      });
    };
    CronExpression._parseField = function _parseField(field, value, constraints) {
      switch (field) {
        case "month":
        case "dayOfWeek":
          var aliases = CronExpression.aliases[field];
          value = value.replace(/[a-z]{3}/gi, function(match) {
            match = match.toLowerCase();
            if (typeof aliases[match] !== "undefined") {
              return aliases[match];
            } else {
              throw new Error('Validation error, cannot resolve alias "' + match + '"');
            }
          });
          break;
      }
      if (!CronExpression.validCharacters[field].test(value)) {
        throw new Error("Invalid characters, got value: " + value);
      }
      if (value.indexOf("*") !== -1) {
        value = value.replace(/\*/g, constraints.min + "-" + constraints.max);
      } else if (value.indexOf("?") !== -1) {
        value = value.replace(/\?/g, constraints.min + "-" + constraints.max);
      }
      function parseSequence(val) {
        var stack = [];
        function handleResult(result) {
          if (result instanceof Array) {
            for (var i2 = 0, c2 = result.length; i2 < c2; i2++) {
              var value2 = result[i2];
              if (CronExpression._isValidConstraintChar(constraints, value2)) {
                stack.push(value2);
                continue;
              }
              if (typeof value2 !== "number" || Number.isNaN(value2) || value2 < constraints.min || value2 > constraints.max) {
                throw new Error(
                  "Constraint error, got value " + value2 + " expected range " + constraints.min + "-" + constraints.max
                );
              }
              stack.push(value2);
            }
          } else {
            if (CronExpression._isValidConstraintChar(constraints, result)) {
              stack.push(result);
              return;
            }
            var numResult = +result;
            if (Number.isNaN(numResult) || numResult < constraints.min || numResult > constraints.max) {
              throw new Error(
                "Constraint error, got value " + result + " expected range " + constraints.min + "-" + constraints.max
              );
            }
            if (field === "dayOfWeek") {
              numResult = numResult % 7;
            }
            stack.push(numResult);
          }
        }
        var atoms = val.split(",");
        if (!atoms.every(function(atom) {
          return atom.length > 0;
        })) {
          throw new Error("Invalid list value format");
        }
        if (atoms.length > 1) {
          for (var i = 0, c = atoms.length; i < c; i++) {
            handleResult(parseRepeat(atoms[i]));
          }
        } else {
          handleResult(parseRepeat(val));
        }
        stack.sort(CronExpression._sortCompareFn);
        return stack;
      }
      function parseRepeat(val) {
        var repeatInterval = 1;
        var atoms = val.split("/");
        if (atoms.length > 2) {
          throw new Error("Invalid repeat: " + val);
        }
        if (atoms.length > 1) {
          if (atoms[0] == +atoms[0]) {
            atoms = [atoms[0] + "-" + constraints.max, atoms[1]];
          }
          return parseRange(atoms[0], atoms[atoms.length - 1]);
        }
        return parseRange(val, repeatInterval);
      }
      function parseRange(val, repeatInterval) {
        var stack = [];
        var atoms = val.split("-");
        if (atoms.length > 1) {
          if (atoms.length < 2) {
            return +val;
          }
          if (!atoms[0].length) {
            if (!atoms[1].length) {
              throw new Error("Invalid range: " + val);
            }
            return +val;
          }
          var min = +atoms[0];
          var max = +atoms[1];
          if (Number.isNaN(min) || Number.isNaN(max) || min < constraints.min || max > constraints.max) {
            throw new Error(
              "Constraint error, got range " + min + "-" + max + " expected range " + constraints.min + "-" + constraints.max
            );
          } else if (min > max) {
            throw new Error("Invalid range: " + val);
          }
          var repeatIndex = +repeatInterval;
          if (Number.isNaN(repeatIndex) || repeatIndex <= 0) {
            throw new Error("Constraint error, cannot repeat at every " + repeatIndex + " time.");
          }
          if (field === "dayOfWeek" && max % 7 === 0) {
            stack.push(0);
          }
          for (var index = min, count = max; index <= count; index++) {
            var exists = stack.indexOf(index) !== -1;
            if (!exists && repeatIndex > 0 && repeatIndex % repeatInterval === 0) {
              repeatIndex = 1;
              stack.push(index);
            } else {
              repeatIndex++;
            }
          }
          return stack;
        }
        return Number.isNaN(+val) ? val : +val;
      }
      return parseSequence(value);
    };
    CronExpression._sortCompareFn = function(a, b) {
      var aIsNumber = typeof a === "number";
      var bIsNumber = typeof b === "number";
      if (aIsNumber && bIsNumber) {
        return a - b;
      }
      if (!aIsNumber && bIsNumber) {
        return 1;
      }
      if (aIsNumber && !bIsNumber) {
        return -1;
      }
      return a.localeCompare(b);
    };
    CronExpression._handleMaxDaysInMonth = function(mappedFields) {
      if (mappedFields.month.length === 1) {
        var daysInMonth = CronExpression.daysInMonth[mappedFields.month[0] - 1];
        if (mappedFields.dayOfMonth[0] > daysInMonth) {
          throw new Error("Invalid explicit day of month definition");
        }
        return mappedFields.dayOfMonth.filter(function(dayOfMonth) {
          return dayOfMonth === "L" ? true : dayOfMonth <= daysInMonth;
        }).sort(CronExpression._sortCompareFn);
      }
    };
    CronExpression._freezeFields = function(fields) {
      for (var i = 0, c = CronExpression.map.length; i < c; ++i) {
        var field = CronExpression.map[i];
        var value = fields[field];
        fields[field] = Object.freeze(value);
      }
      return Object.freeze(fields);
    };
    CronExpression.prototype._applyTimezoneShift = function(currentDate, dateMathVerb, method) {
      if (method === "Month" || method === "Day") {
        var prevTime = currentDate.getTime();
        currentDate[dateMathVerb + method]();
        var currTime = currentDate.getTime();
        if (prevTime === currTime) {
          if (currentDate.getMinutes() === 0 && currentDate.getSeconds() === 0) {
            currentDate.addHour();
          } else if (currentDate.getMinutes() === 59 && currentDate.getSeconds() === 59) {
            currentDate.subtractHour();
          }
        }
      } else {
        var previousHour = currentDate.getHours();
        currentDate[dateMathVerb + method]();
        var currentHour = currentDate.getHours();
        var diff = currentHour - previousHour;
        if (diff === 2) {
          if (this.fields.hour.length !== 24) {
            this._dstStart = currentHour;
          }
        } else if (diff === 0 && currentDate.getMinutes() === 0 && currentDate.getSeconds() === 0) {
          if (this.fields.hour.length !== 24) {
            this._dstEnd = currentHour;
          }
        }
      }
    };
    CronExpression.prototype._findSchedule = function _findSchedule(reverse) {
      function matchSchedule(value, sequence) {
        for (var i = 0, c = sequence.length; i < c; i++) {
          if (sequence[i] >= value) {
            return sequence[i] === value;
          }
        }
        return sequence[0] === value;
      }
      function isNthDayMatch(date, nthDayOfWeek) {
        if (nthDayOfWeek < 6) {
          if (date.getDate() < 8 && nthDayOfWeek === 1) {
            return true;
          }
          var offset = date.getDate() % 7 ? 1 : 0;
          var adjustedDate = date.getDate() - date.getDate() % 7;
          var occurrence = Math.floor(adjustedDate / 7) + offset;
          return occurrence === nthDayOfWeek;
        }
        return false;
      }
      function isLInExpressions(expressions) {
        return expressions.length > 0 && expressions.some(function(expression) {
          return typeof expression === "string" && expression.indexOf("L") >= 0;
        });
      }
      reverse = reverse || false;
      var dateMathVerb = reverse ? "subtract" : "add";
      var currentDate = new CronDate(this._currentDate, this._tz);
      var startDate = this._startDate;
      var endDate = this._endDate;
      var startTimestamp = currentDate.getTime();
      var stepCount = 0;
      function isLastWeekdayOfMonthMatch(expressions) {
        return expressions.some(function(expression) {
          if (!isLInExpressions([expression])) {
            return false;
          }
          var weekday = Number.parseInt(expression[0]) % 7;
          if (Number.isNaN(weekday)) {
            throw new Error("Invalid last weekday of the month expression: " + expression);
          }
          return currentDate.getDay() === weekday && currentDate.isLastWeekdayOfMonth();
        });
      }
      while (stepCount < LOOP_LIMIT) {
        stepCount++;
        if (reverse) {
          if (startDate && currentDate.getTime() - startDate.getTime() < 0) {
            throw new Error("Out of the timespan range");
          }
        } else {
          if (endDate && endDate.getTime() - currentDate.getTime() < 0) {
            throw new Error("Out of the timespan range");
          }
        }
        var dayOfMonthMatch = matchSchedule(currentDate.getDate(), this.fields.dayOfMonth);
        if (isLInExpressions(this.fields.dayOfMonth)) {
          dayOfMonthMatch = dayOfMonthMatch || currentDate.isLastDayOfMonth();
        }
        var dayOfWeekMatch = matchSchedule(currentDate.getDay(), this.fields.dayOfWeek);
        if (isLInExpressions(this.fields.dayOfWeek)) {
          dayOfWeekMatch = dayOfWeekMatch || isLastWeekdayOfMonthMatch(this.fields.dayOfWeek);
        }
        var isDayOfMonthWildcardMatch = this.fields.dayOfMonth.length >= CronExpression.daysInMonth[currentDate.getMonth()];
        var isDayOfWeekWildcardMatch = this.fields.dayOfWeek.length === CronExpression.constraints[5].max - CronExpression.constraints[5].min + 1;
        var currentHour = currentDate.getHours();
        if (!dayOfMonthMatch && (!dayOfWeekMatch || isDayOfWeekWildcardMatch)) {
          this._applyTimezoneShift(currentDate, dateMathVerb, "Day");
          continue;
        }
        if (!isDayOfMonthWildcardMatch && isDayOfWeekWildcardMatch && !dayOfMonthMatch) {
          this._applyTimezoneShift(currentDate, dateMathVerb, "Day");
          continue;
        }
        if (isDayOfMonthWildcardMatch && !isDayOfWeekWildcardMatch && !dayOfWeekMatch) {
          this._applyTimezoneShift(currentDate, dateMathVerb, "Day");
          continue;
        }
        if (this._nthDayOfWeek > 0 && !isNthDayMatch(currentDate, this._nthDayOfWeek)) {
          this._applyTimezoneShift(currentDate, dateMathVerb, "Day");
          continue;
        }
        if (!matchSchedule(currentDate.getMonth() + 1, this.fields.month)) {
          this._applyTimezoneShift(currentDate, dateMathVerb, "Month");
          continue;
        }
        if (!matchSchedule(currentHour, this.fields.hour)) {
          if (this._dstStart !== currentHour) {
            this._dstStart = null;
            this._applyTimezoneShift(currentDate, dateMathVerb, "Hour");
            continue;
          } else if (!matchSchedule(currentHour - 1, this.fields.hour)) {
            currentDate[dateMathVerb + "Hour"]();
            continue;
          }
        } else if (this._dstEnd === currentHour) {
          if (!reverse) {
            this._dstEnd = null;
            this._applyTimezoneShift(currentDate, "add", "Hour");
            continue;
          }
        }
        if (!matchSchedule(currentDate.getMinutes(), this.fields.minute)) {
          this._applyTimezoneShift(currentDate, dateMathVerb, "Minute");
          continue;
        }
        if (!matchSchedule(currentDate.getSeconds(), this.fields.second)) {
          this._applyTimezoneShift(currentDate, dateMathVerb, "Second");
          continue;
        }
        if (startTimestamp === currentDate.getTime()) {
          if (dateMathVerb === "add" || currentDate.getMilliseconds() === 0) {
            this._applyTimezoneShift(currentDate, dateMathVerb, "Second");
          } else {
            currentDate.setMilliseconds(0);
          }
          continue;
        }
        break;
      }
      if (stepCount >= LOOP_LIMIT) {
        throw new Error("Invalid expression, loop limit exceeded");
      }
      this._currentDate = new CronDate(currentDate, this._tz);
      this._hasIterated = true;
      return currentDate;
    };
    CronExpression.prototype.next = function next() {
      var schedule = this._findSchedule();
      if (this._isIterator) {
        return {
          value: schedule,
          done: !this.hasNext()
        };
      }
      return schedule;
    };
    CronExpression.prototype.prev = function prev() {
      var schedule = this._findSchedule(true);
      if (this._isIterator) {
        return {
          value: schedule,
          done: !this.hasPrev()
        };
      }
      return schedule;
    };
    CronExpression.prototype.hasNext = function() {
      var current = this._currentDate;
      var hasIterated = this._hasIterated;
      try {
        this._findSchedule();
        return true;
      } catch (err) {
        return false;
      } finally {
        this._currentDate = current;
        this._hasIterated = hasIterated;
      }
    };
    CronExpression.prototype.hasPrev = function() {
      var current = this._currentDate;
      var hasIterated = this._hasIterated;
      try {
        this._findSchedule(true);
        return true;
      } catch (err) {
        return false;
      } finally {
        this._currentDate = current;
        this._hasIterated = hasIterated;
      }
    };
    CronExpression.prototype.iterate = function iterate(steps, callback) {
      var dates = [];
      if (steps >= 0) {
        for (var i = 0, c = steps; i < c; i++) {
          try {
            var item = this.next();
            dates.push(item);
            if (callback) {
              callback(item, i);
            }
          } catch (err) {
            break;
          }
        }
      } else {
        for (var i = 0, c = steps; i > c; i--) {
          try {
            var item = this.prev();
            dates.push(item);
            if (callback) {
              callback(item, i);
            }
          } catch (err) {
            break;
          }
        }
      }
      return dates;
    };
    CronExpression.prototype.reset = function reset(newDate) {
      this._currentDate = new CronDate(newDate || this._options.currentDate);
    };
    CronExpression.prototype.stringify = function stringify(includeSeconds) {
      var resultArr = [];
      for (var i = includeSeconds ? 0 : 1, c = CronExpression.map.length; i < c; ++i) {
        var field = CronExpression.map[i];
        var value = this.fields[field];
        var constraint = CronExpression.constraints[i];
        if (field === "dayOfMonth" && this.fields.month.length === 1) {
          constraint = { min: 1, max: CronExpression.daysInMonth[this.fields.month[0] - 1] };
        } else if (field === "dayOfWeek") {
          constraint = { min: 0, max: 6 };
          value = value[value.length - 1] === 7 ? value.slice(0, -1) : value;
        }
        resultArr.push(stringifyField(value, constraint.min, constraint.max));
      }
      return resultArr.join(" ");
    };
    CronExpression.parse = function parse(expression, options) {
      var self = this;
      if (typeof options === "function") {
        options = {};
      }
      function parse2(expression2, options2) {
        if (!options2) {
          options2 = {};
        }
        if (typeof options2.currentDate === "undefined") {
          options2.currentDate = new CronDate(void 0, self._tz);
        }
        if (CronExpression.predefined[expression2]) {
          expression2 = CronExpression.predefined[expression2];
        }
        var fields = [];
        var atoms = (expression2 + "").trim().split(/\s+/);
        if (atoms.length > 6) {
          throw new Error("Invalid cron expression");
        }
        var start = CronExpression.map.length - atoms.length;
        for (var i = 0, c = CronExpression.map.length; i < c; ++i) {
          var field = CronExpression.map[i];
          var value = atoms[atoms.length > c ? i : i - start];
          if (i < start || !value) {
            fields.push(
              CronExpression._parseField(
                field,
                CronExpression.parseDefaults[i],
                CronExpression.constraints[i]
              )
            );
          } else {
            var val = field === "dayOfWeek" ? parseNthDay(value) : value;
            fields.push(
              CronExpression._parseField(
                field,
                val,
                CronExpression.constraints[i]
              )
            );
          }
        }
        var mappedFields = {};
        for (var i = 0, c = CronExpression.map.length; i < c; i++) {
          var key = CronExpression.map[i];
          mappedFields[key] = fields[i];
        }
        var dayOfMonth = CronExpression._handleMaxDaysInMonth(mappedFields);
        mappedFields.dayOfMonth = dayOfMonth || mappedFields.dayOfMonth;
        return new CronExpression(mappedFields, options2);
        function parseNthDay(val2) {
          var atoms2 = val2.split("#");
          if (atoms2.length > 1) {
            var nthValue = +atoms2[atoms2.length - 1];
            if (/,/.test(val2)) {
              throw new Error("Constraint error, invalid dayOfWeek `#` and `,` special characters are incompatible");
            }
            if (/\//.test(val2)) {
              throw new Error("Constraint error, invalid dayOfWeek `#` and `/` special characters are incompatible");
            }
            if (/-/.test(val2)) {
              throw new Error("Constraint error, invalid dayOfWeek `#` and `-` special characters are incompatible");
            }
            if (atoms2.length > 2 || Number.isNaN(nthValue) || (nthValue < 1 || nthValue > 5)) {
              throw new Error("Constraint error, invalid dayOfWeek occurrence number (#)");
            }
            options2.nthDayOfWeek = nthValue;
            return atoms2[0];
          }
          return val2;
        }
      }
      return parse2(expression, options);
    };
    CronExpression.fieldsToExpression = function fieldsToExpression(fields, options) {
      function validateConstraints(field2, values2, constraints) {
        if (!values2) {
          throw new Error("Validation error, Field " + field2 + " is missing");
        }
        if (values2.length === 0) {
          throw new Error("Validation error, Field " + field2 + " contains no values");
        }
        for (var i2 = 0, c2 = values2.length; i2 < c2; i2++) {
          var value = values2[i2];
          if (CronExpression._isValidConstraintChar(constraints, value)) {
            continue;
          }
          if (typeof value !== "number" || Number.isNaN(value) || value < constraints.min || value > constraints.max) {
            throw new Error(
              "Constraint error, got value " + value + " expected range " + constraints.min + "-" + constraints.max
            );
          }
        }
      }
      var mappedFields = {};
      for (var i = 0, c = CronExpression.map.length; i < c; ++i) {
        var field = CronExpression.map[i];
        var values = fields[field];
        validateConstraints(
          field,
          values,
          CronExpression.constraints[i]
        );
        var copy = [];
        var j = -1;
        while (++j < values.length) {
          copy[j] = values[j];
        }
        values = copy.sort(CronExpression._sortCompareFn).filter(function(item, pos, ary) {
          return !pos || item !== ary[pos - 1];
        });
        if (values.length !== copy.length) {
          throw new Error("Validation error, Field " + field + " contains duplicate values");
        }
        mappedFields[field] = values;
      }
      var dayOfMonth = CronExpression._handleMaxDaysInMonth(mappedFields);
      mappedFields.dayOfMonth = dayOfMonth || mappedFields.dayOfMonth;
      return new CronExpression(mappedFields, options || {});
    };
    module.exports = CronExpression;
  }
});

// (disabled):fs
var require_fs = __commonJS({
  "(disabled):fs"() {
  }
});

// node_modules/cron-parser/lib/parser.js
var require_parser = __commonJS({
  "node_modules/cron-parser/lib/parser.js"(exports, module) {
    "use strict";
    var CronExpression = require_expression();
    function CronParser() {
    }
    CronParser._parseEntry = function _parseEntry(entry) {
      var atoms = entry.split(" ");
      if (atoms.length === 6) {
        return {
          interval: CronExpression.parse(entry)
        };
      } else if (atoms.length > 6) {
        return {
          interval: CronExpression.parse(
            atoms.slice(0, 6).join(" ")
          ),
          command: atoms.slice(6, atoms.length)
        };
      } else {
        throw new Error("Invalid entry: " + entry);
      }
    };
    CronParser.parseExpression = function parseExpression2(expression, options) {
      return CronExpression.parse(expression, options);
    };
    CronParser.fieldsToExpression = function fieldsToExpression(fields, options) {
      return CronExpression.fieldsToExpression(fields, options);
    };
    CronParser.parseString = function parseString(data) {
      var blocks = data.split("\n");
      var response = {
        variables: {},
        expressions: [],
        errors: {}
      };
      for (var i = 0, c = blocks.length; i < c; i++) {
        var block = blocks[i];
        var matches = null;
        var entry = block.trim();
        if (entry.length > 0) {
          if (entry.match(/^#/)) {
            continue;
          } else if (matches = entry.match(/^(.*)=(.*)$/)) {
            response.variables[matches[1]] = matches[2];
          } else {
            var result = null;
            try {
              result = CronParser._parseEntry("0 " + entry);
              response.expressions.push(result.interval);
            } catch (err) {
              response.errors[entry] = err;
            }
          }
        }
      }
      return response;
    };
    CronParser.parseFile = function parseFile(filePath, callback) {
      require_fs().readFile(filePath, function(err, data) {
        if (err) {
          callback(err);
          return;
        }
        return callback(null, CronParser.parseString(data.toString()));
      });
    };
    module.exports = CronParser;
  }
});

// src/Panel.tsx
import { useEffect as useEffect4, useMemo as useMemo11, useState as useState15 } from "react";

// src/host.ts
function getHostInvoke() {
  const fn = window.__POLARIS_HOST_INVOKE__;
  if (typeof fn !== "function") {
    throw new Error("\u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u540E\u518D\u6253\u5F00\u672C\u63D2\u4EF6\u3002");
  }
  return fn;
}
function sendToChat(text) {
  const fn = window.__POLARIS_SEND_TO_CHAT__;
  if (typeof fn !== "function") return false;
  fn(text);
  return true;
}
function hasSendToChat() {
  if (typeof window === "undefined") return false;
  const fn = window.__POLARIS_SEND_TO_CHAT__;
  return typeof fn === "function";
}

// src/model.ts
async function capDispatch(target, payload) {
  const invoke = getHostInvoke();
  const res = await invoke("router_dispatch", { req: { target, payload } });
  if (!res.ok) throw new Error(res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  const r = await capDispatch("cap.kv", { action: "get", key });
  return r && r.value !== void 0 ? r.value : null;
}
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value });
}
var KV_FAVS = "devtoolbox.favs";
var KV_LAST = "devtoolbox.last";

// src/tools/JwtTool.tsx
import { useMemo, useState as useState2 } from "react";

// src/core/b64.ts
var B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var B64_URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function bytesToBase64(bytes, urlSafe = false) {
  const alphabet = urlSafe ? B64_URL_ALPHABET : B64_ALPHABET;
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    out += alphabet[b0 >> 2];
    out += alphabet[(b0 & 3) << 4 | b1 >> 4];
    out += has1 ? alphabet[(b1 & 15) << 2 | b2 >> 6] : "=";
    out += has2 ? alphabet[b2 & 63] : "=";
  }
  return out;
}
function base64ToBytesStrict(input) {
  const clean = input.replace(/[\s=]+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (/[^A-Za-z0-9+/]/.test(clean)) throw new Error("\u5305\u542B\u975E Base64 \u5B57\u7B26");
  if (clean.length % 4 === 1) throw new Error("Base64 \u957F\u5EA6\u975E\u6CD5\uFF08\u53BB\u6389\u586B\u5145\u540E\u4F59 1\uFF09");
  const padNeeded = (4 - clean.length % 4) % 4;
  const padded = clean + "=".repeat(padNeeded);
  const out = new Uint8Array(Math.floor(padded.length / 4 * 3));
  let o = 0;
  for (let i = 0; i < padded.length; i += 4) {
    const c0 = B64_ALPHABET.indexOf(padded[i]);
    const c1 = B64_ALPHABET.indexOf(padded[i + 1]);
    const c2 = padded[i + 2] === "=" ? 0 : B64_ALPHABET.indexOf(padded[i + 2]);
    const c3 = padded[i + 3] === "=" ? 0 : B64_ALPHABET.indexOf(padded[i + 3]);
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) throw new Error("\u5305\u542B\u975E Base64 \u5B57\u7B26");
    out[o++] = c0 << 2 | c1 >> 4;
    if (padded[i + 2] !== "=") out[o++] = (c1 & 15) << 4 | c2 >> 2;
    if (padded[i + 3] !== "=") out[o++] = (c2 & 3) << 6 | c3;
  }
  return out.subarray(0, o);
}
function base64ToUtf8(input) {
  const bytes = base64ToBytesStrict(input);
  const decoder = new TextDecoder("utf-8");
  const text = decoder.decode(bytes);
  const replaced = (text.match(/\uFFFD/g) || []).length;
  return { text, replacedChars: replaced, byteLength: bytes.length };
}
function utf8ToBase64(text, urlSafe = false) {
  return bytesToBase64(new TextEncoder().encode(text), urlSafe);
}
function urlDecode(input) {
  let strictFailed = false;
  let text;
  try {
    text = decodeURIComponent(input);
  } catch {
    strictFailed = true;
    text = "";
  }
  let textForm;
  try {
    textForm = decodeURIComponent(input.replace(/\+/g, "%20"));
  } catch (e) {
    if (strictFailed) throw new Error(`URL \u89E3\u7801\u5931\u8D25\uFF1A${e.message}`);
    textForm = text;
  }
  if (strictFailed) text = textForm;
  return { text, textForm, strictFailed };
}
function urlEncode(input) {
  return encodeURIComponent(input);
}

// src/core/hash.ts
var MD5_K = new Int32Array([
  3614090360,
  3905402710,
  606105819,
  3250441966,
  4118548399,
  1200080426,
  2821735955,
  4249261313,
  1770035416,
  2336552879,
  4294925233,
  2304563134,
  1804603682,
  4254626195,
  2792965006,
  1236535329,
  4129170786,
  3225465664,
  643717713,
  3921069994,
  3593408605,
  38016083,
  3634488961,
  3889429448,
  568446438,
  3275163606,
  4107603335,
  1163531501,
  2850285829,
  4243563512,
  1735328473,
  2368359562,
  4294588738,
  2272392833,
  1839030562,
  4259657740,
  2763975236,
  1272893353,
  4139469664,
  3200236656,
  681279174,
  3936430074,
  3572445317,
  76029189,
  3654602809,
  3873151461,
  530742520,
  3299628645,
  4096336452,
  1126891415,
  2878612391,
  4237533241,
  1700485571,
  2399980690,
  4293915773,
  2240044497,
  1873313359,
  4264355552,
  2734768916,
  1309151649,
  4149444226,
  3174756917,
  718787259,
  3951481745
]);
var MD5_S = [
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21
];
function rotl(x, c) {
  return x << c | x >>> 32 - c;
}
function md5Bytes(input) {
  const bitLen = input.length * 8;
  const paddedLen = (input.length + 8 >> 6) + 1 << 6;
  const m = new Uint8Array(paddedLen);
  m.set(input);
  m[input.length] = 128;
  const view = new DataView(m.buffer);
  view.setUint32(paddedLen - 8, bitLen >>> 0, true);
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 4294967296), true);
  let a0 = 1732584193;
  let b0 = 4023233417;
  let c0 = 2562383102;
  let d0 = 271733878;
  for (let chunk = 0; chunk < paddedLen; chunk += 64) {
    const M = new Int32Array(16);
    for (let i = 0; i < 16; i++) M[i] = view.getInt32(chunk + i * 4, true);
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F;
      let g;
      if (i < 16) {
        F = B & C | ~B & D;
        g = i;
      } else if (i < 32) {
        F = D & B | ~D & C;
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = 7 * i % 16;
      }
      F = F + A + MD5_K[i] + M[g] | 0;
      A = D;
      D = C;
      C = B;
      B = B + rotl(F, MD5_S[i]) | 0;
    }
    a0 = a0 + A | 0;
    b0 = b0 + B | 0;
    c0 = c0 + C | 0;
    d0 = d0 + D | 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  out.setInt32(0, a0, true);
  out.setInt32(4, b0, true);
  out.setInt32(8, c0, true);
  out.setInt32(12, d0, true);
  const hex = [];
  for (let i = 0; i < 16; i++) hex.push(out.getUint8(i).toString(16).padStart(2, "0"));
  return hex.join("");
}
function md5(text) {
  return md5Bytes(new TextEncoder().encode(text));
}
var SUBTLE_NAMES = {
  sha1: "SHA-1",
  sha256: "SHA-256",
  sha384: "SHA-384",
  sha512: "SHA-512"
};
function subtleHashName(algorithm) {
  return SUBTLE_NAMES[algorithm];
}
function bytesToHex(bytes) {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}
async function shaHex(algorithm, text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest(subtleHashName(algorithm), data);
  return bytesToHex(new Uint8Array(digest));
}
async function hmacHex(algorithm, text, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: subtleHashName(algorithm) },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  return bytesToHex(new Uint8Array(sig));
}
async function hashText(algorithm, text, hmacSecret) {
  if (hmacSecret !== void 0 && hmacSecret !== "") {
    if (algorithm === "md5") throw new Error("HMAC \u4E0D\u652F\u6301 MD5\uFF08WebCrypto \u9650\u5236\uFF09");
    return hmacHex(algorithm, text, hmacSecret);
  }
  if (algorithm === "md5") return md5(text);
  return shaHex(algorithm, text);
}

// src/core/uuid.ts
function randomBytes(n) {
  const bytes = new Uint8Array(n);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    throw new Error("\u8FD0\u884C\u73AF\u5883\u7F3A\u5C11 crypto.getRandomValues\uFF08\u9700\u8981\u6D4F\u89C8\u5668\u6216 node \u226518\uFF09");
  }
  return bytes;
}
function formatUuid(bytes) {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function uuidV4() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = randomBytes(16);
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  return formatUuid(bytes);
}
var v7LastMs = -1;
var v7Seq = 0;
function uuidV7(now = Date.now()) {
  const bytes = randomBytes(16);
  if (now === v7LastMs) {
    v7Seq = v7Seq + 1 & 4095;
  } else {
    v7LastMs = now;
    const rnd = randomBytes(2);
    v7Seq = (rnd[0] & 15) << 8 | rnd[1];
  }
  bytes[0] = now / 2 ** 40 & 255;
  bytes[1] = now / 2 ** 32 & 255;
  bytes[2] = now / 2 ** 24 & 255;
  bytes[3] = now / 2 ** 16 & 255;
  bytes[4] = now / 2 ** 8 & 255;
  bytes[5] = now & 255;
  bytes[6] = 112 | v7Seq >> 8 & 15;
  bytes[7] = v7Seq & 255;
  bytes[8] = bytes[8] & 63 | 128;
  return formatUuid(bytes);
}
function generateUuids(count, version) {
  const n = Math.max(1, Math.min(500, Math.floor(count) || 1));
  const out = [];
  for (let i = 0; i < n; i++) out.push(version === "v7" ? uuidV7() : uuidV4());
  return out;
}
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parseUuid(input) {
  const trimmed = input.trim().toLowerCase().replace(/[{}]/g, "");
  if (!UUID_RE.test(trimmed)) return { ok: false, error: "\u4E0D\u662F\u5408\u6CD5\u7684 UUID \u683C\u5F0F\uFF088-4-4-4-12 \u5341\u516D\u8FDB\u5236\uFF09" };
  const version = parseInt(trimmed[14], 16);
  const variantBits = parseInt(trimmed[19], 16) >> 2;
  let variant;
  if (variantBits === 0) variant = "NCS\uFF08\u4FDD\u7559\uFF0C\u5411\u540E\u517C\u5BB9\uFF09";
  else if (variantBits === 1) variant = "RFC 4122\uFF08\u6807\u51C6\uFF09";
  else if (variantBits === 2) variant = "Microsoft\uFF08\u4FDD\u7559\uFF09";
  else variant = "\u4FDD\u7559\uFF08\u81EA\u5B9A\u4E49\uFF09";
  return { ok: true, version, variant, canonical: trimmed };
}

// src/core/jwt.ts
function decodePart(part, label) {
  if (part === "") throw new Error(`${label} \u4E3A\u7A7A`);
  let decoded;
  try {
    decoded = base64ToUtf8(part);
  } catch (e) {
    throw new Error(`${label} \u4E0D\u662F\u5408\u6CD5\u7684 base64url\uFF1A${e.message}`);
  }
  if (decoded.replacedChars > 0) throw new Error(`${label} \u89E3\u7801\u540E\u4E0D\u662F\u5408\u6CD5 UTF-8\uFF08\u53EF\u80FD\u4E0D\u662F JWT\uFF09`);
  let obj;
  try {
    obj = JSON.parse(decoded.text);
  } catch {
    throw new Error(`${label} \u89E3\u7801\u540E\u4E0D\u662F\u5408\u6CD5 JSON`);
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    throw new Error(`${label} \u89E3\u7801\u540E\u4E0D\u662F JSON \u5BF9\u8C61`);
  }
  return obj;
}
function toTimeClaim(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return void 0;
  return { epoch: Math.floor(seconds), isoUtc: new Date(Math.floor(seconds) * 1e3).toISOString() };
}
function humanizeDuration(ms) {
  const abs = Math.abs(ms);
  const units = [
    [365 * 24 * 36e5, "\u5E74"],
    [30 * 24 * 36e5, "\u4E2A\u6708"],
    [24 * 36e5, "\u5929"],
    [36e5, "\u5C0F\u65F6"],
    [6e4, "\u5206\u949F"],
    [1e3, "\u79D2"]
  ];
  for (const [scale, unit] of units) {
    if (abs >= scale) {
      const v = Math.round(abs / scale);
      return `${v} ${unit}`;
    }
  }
  return "\u4E0D\u5230 1 \u79D2";
}
function decodeJwt(token) {
  const trimmed = token.trim();
  if (trimmed === "") throw new Error("JWT \u4E3A\u7A7A");
  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    throw new Error(`JWT \u5E94\u4E3A 3 \u6BB5\uFF08header.payload.signature\uFF09\uFF0C\u5B9E\u9645 ${parts.length} \u6BB5`);
  }
  const header = decodePart(parts[0], "header");
  const payload = decodePart(parts[1], "payload");
  const iat = toTimeClaim(payload.iat);
  const nbf = toTimeClaim(payload.nbf);
  const exp = toTimeClaim(payload.exp);
  let expiryState = "no-exp";
  let expiryDetail = "\u65E0 exp \u8FC7\u671F\u58F0\u660E";
  if (exp) {
    const diff = exp.epoch * 1e3 - Date.now();
    if (diff > 0) {
      expiryState = "valid";
      expiryDetail = `\u8FD8\u6709 ${humanizeDuration(diff)}\u8FC7\u671F`;
    } else {
      expiryState = "expired";
      expiryDetail = `\u5DF2\u8FC7\u671F ${humanizeDuration(-diff)}`;
    }
  }
  return {
    header,
    payload,
    signatureRaw: parts[2],
    parts: { header: parts[0], payload: parts[1], signature: parts[2] },
    iat,
    nbf,
    exp,
    expiryState,
    expiryDetail
  };
}
var HS_HASH = {
  HS256: "SHA-256",
  HS384: "SHA-384",
  HS512: "SHA-512"
};
async function verifyJwtHs(token, secret) {
  let decoded;
  try {
    decoded = decodeJwt(token);
  } catch (e) {
    return { ok: false, detail: e.message };
  }
  const alg = decoded.header.alg;
  if (typeof alg !== "string" || !(alg in HS_HASH)) {
    return { ok: false, detail: `\u672C\u5DE5\u5177\u53EA\u652F\u6301 HS256/HS384/HS512 \u9A8C\u7B7E\uFF0C\u5F53\u524D alg=${String(alg ?? "\u7F3A\u5931")}` };
  }
  if (secret === "") return { ok: false, detail: "\u9A8C\u7B7E\u9700\u8981\u5171\u4EAB\u5BC6\u94A5\uFF08secret\uFF09" };
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: HS_HASH[alg] },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${decoded.parts.header}.${decoded.parts.payload}`));
  const sigB64url = bytesToBase64(new Uint8Array(sig), true);
  let diff = 0;
  const a = decoded.parts.signature.replace(/=+$/, "");
  const b = sigB64url.replace(/=+$/, "");
  if (a.length !== b.length) diff = 1;
  else {
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0 ? { ok: true, detail: `${alg} \u9A8C\u7B7E\u901A\u8FC7` } : { ok: false, detail: `${alg} \u9A8C\u7B7E\u5931\u8D25\uFF1A\u7B7E\u540D\u4E0D\u5339\u914D\uFF08\u5BC6\u94A5\u9519\u8BEF\u6216 payload \u88AB\u6539\u52A8\uFF09` };
}

// src/core/time.ts
var WEEKDAYS = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
function relativeTime(epochMs, now = Date.now()) {
  const diff = epochMs - now;
  const abs = Math.abs(diff);
  const units = [
    [365 * 24 * 36e5, "\u5E74"],
    [30 * 24 * 36e5, "\u4E2A\u6708"],
    [7 * 24 * 36e5, "\u5468"],
    [24 * 36e5, "\u5929"],
    [36e5, "\u5C0F\u65F6"],
    [6e4, "\u5206\u949F"],
    [1e3, "\u79D2"]
  ];
  for (const [scale, unit] of units) {
    if (abs >= scale) {
      const v = Math.round(abs / scale);
      return diff > 0 ? `${v} ${unit}\u540E` : `${v} ${unit}\u524D`;
    }
  }
  return diff > 0 ? "\u521A\u521A\uFF08\u672A\u6765\uFF09" : "\u521A\u521A";
}
function pad(n, w = 2) {
  return String(n).padStart(w, "0");
}
function toLocalIso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
function analyzeTimestamp(raw, forceUnit = "auto") {
  const input = raw.trim();
  if (input === "") return { ok: false, error: "\u8F93\u5165\u4E3A\u7A7A", input };
  if (!/^-?\d+$/.test(input)) return { ok: false, error: "\u4E0D\u662F\u7EAF\u6570\u5B57\u65F6\u95F4\u6233\uFF08\u652F\u6301\u8D1F\u6570\uFF09\uFF0C\u65E5\u671F\u6587\u672C\u8BF7\u7528\u4E0B\u9762\u7684\u65E5\u671F\u9009\u62E9\u5668", input };
  const value = Number(input);
  if (!Number.isSafeInteger(value)) return { ok: false, error: "\u8D85\u51FA\u5B89\u5168\u6574\u6570\u8303\u56F4", input };
  const abs = Math.abs(value);
  let unit;
  if (forceUnit === "s") unit = "s";
  else if (forceUnit === "ms") unit = "ms";
  else if (abs < 1e11) unit = "s";
  else if (abs < 1e14) unit = "ms";
  else if (abs < 1e17) unit = "us";
  else unit = "ns";
  let epochMs;
  if (unit === "s") epochMs = value * 1e3;
  else if (unit === "ms") epochMs = value;
  else if (unit === "us") epochMs = Math.round(value / 1e3);
  else epochMs = Math.round(value / 1e6);
  const d = new Date(epochMs);
  if (Number.isNaN(d.getTime())) return { ok: false, error: "\u65E0\u6CD5\u8868\u793A\u4E3A\u6709\u6548\u65E5\u671F", input };
  return {
    ok: true,
    input,
    unit,
    epochMs,
    isoUtc: d.toISOString(),
    isoLocal: toLocalIso(d),
    localReadable: `${toLocalIso(d)} ${WEEKDAYS[d.getDay()]}`,
    weekday: WEEKDAYS[d.getDay()],
    relative: relativeTime(epochMs)
  };
}
function dateInputToEpochMs(local) {
  if (!local) return null;
  const ms = new Date(local).getTime();
  return Number.isNaN(ms) ? null : ms;
}
function nowInfo() {
  const ms = Date.now();
  const d = new Date(ms);
  return {
    seconds: Math.floor(ms / 1e3),
    millis: ms,
    isoUtc: d.toISOString(),
    localReadable: `${toLocalIso(d)} ${WEEKDAYS[d.getDay()]}`
  };
}

// src/core/json.ts
function sortValueDeep(value) {
  if (Array.isArray(value)) return value.map(sortValueDeep);
  if (value !== null && typeof value === "object") {
    const obj = value;
    const keys = Object.keys(obj).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const out = {};
    for (const k of keys) out[k] = sortValueDeep(obj[k]);
    return out;
  }
  return value;
}
function locateError(message, input) {
  const m = message.match(/\(line (\d+) column (\d+)\)/);
  if (m) return { line: Number(m[1]), column: Number(m[2]) };
  const p = message.match(/position (\d+)/);
  if (p) {
    const pos = Math.min(Number(p[1]), input.length);
    let line = 1;
    let column = 1;
    for (let i = 0; i < pos; i++) {
      if (input[i] === "\n") {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
    return { line, column };
  }
  return {};
}
function formatJson(text, opts = {}) {
  const inputChars = text.length;
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    const msg = e.message;
    const loc = locateError(msg, text);
    return {
      ok: false,
      output: "",
      error: msg,
      errorLine: loc.line,
      errorColumn: loc.column,
      inputChars,
      outputChars: 0
    };
  }
  if (opts.sortKeys) value = sortValueDeep(value);
  const output = opts.minify ? JSON.stringify(value) : JSON.stringify(value, null, opts.indent ?? 2);
  return { ok: true, output, inputChars, outputChars: output.length };
}

// node_modules/js-yaml/dist/js-yaml.mjs
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var jsYaml = {};
var loader = {};
var common = {};
var hasRequiredCommon;
function requireCommon() {
  if (hasRequiredCommon) return common;
  hasRequiredCommon = 1;
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
    if (source) {
      const sourceKeys = Object.keys(source);
      for (let index = 0, length = sourceKeys.length; index < length; index += 1) {
        const key = sourceKeys[index];
        target[key] = source[key];
      }
    }
    return target;
  }
  function repeat(string, count) {
    let result = "";
    for (let cycle = 0; cycle < count; cycle += 1) {
      result += string;
    }
    return result;
  }
  function isNegativeZero(number) {
    return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
  }
  common.isNothing = isNothing;
  common.isObject = isObject;
  common.toArray = toArray;
  common.repeat = repeat;
  common.isNegativeZero = isNegativeZero;
  common.extend = extend;
  return common;
}
var exception;
var hasRequiredException;
function requireException() {
  if (hasRequiredException) return exception;
  hasRequiredException = 1;
  function formatError(exception2, compact) {
    let where = "";
    const message = exception2.reason || "(unknown reason)";
    if (!exception2.mark) return message;
    if (exception2.mark.name) {
      where += 'in "' + exception2.mark.name + '" ';
    }
    where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
    if (!compact && exception2.mark.snippet) {
      where += "\n\n" + exception2.mark.snippet;
    }
    return message + " " + where;
  }
  function YAMLException2(reason, mark) {
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
  YAMLException2.prototype = Object.create(Error.prototype);
  YAMLException2.prototype.constructor = YAMLException2;
  YAMLException2.prototype.toString = function toString(compact) {
    return this.name + ": " + formatError(this, compact);
  };
  exception = YAMLException2;
  return exception;
}
var snippet;
var hasRequiredSnippet;
function requireSnippet() {
  if (hasRequiredSnippet) return snippet;
  hasRequiredSnippet = 1;
  const common2 = requireCommon();
  function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
    let head = "";
    let tail = "";
    const maxHalfLength = Math.floor(maxLineLength / 2) - 1;
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
    return common2.repeat(" ", max - string.length) + string;
  }
  function makeSnippet(mark, options) {
    options = Object.create(options || null);
    if (!mark.buffer) return null;
    if (!options.maxLength) options.maxLength = 79;
    if (typeof options.indent !== "number") options.indent = 1;
    if (typeof options.linesBefore !== "number") options.linesBefore = 3;
    if (typeof options.linesAfter !== "number") options.linesAfter = 2;
    const re = /\r?\n|\r|\0/g;
    const lineStarts = [0];
    const lineEnds = [];
    let match;
    let foundLineNo = -1;
    while (match = re.exec(mark.buffer)) {
      lineEnds.push(match.index);
      lineStarts.push(match.index + match[0].length);
      if (mark.position <= match.index && foundLineNo < 0) {
        foundLineNo = lineStarts.length - 2;
      }
    }
    if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
    let result = "";
    const lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
    const maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
    for (let i = 1; i <= options.linesBefore; i++) {
      if (foundLineNo - i < 0) break;
      const line2 = getLine(
        mark.buffer,
        lineStarts[foundLineNo - i],
        lineEnds[foundLineNo - i],
        mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
        maxLineLength
      );
      result = common2.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line2.str + "\n" + result;
    }
    const line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
    result += common2.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
    result += common2.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
    for (let i = 1; i <= options.linesAfter; i++) {
      if (foundLineNo + i >= lineEnds.length) break;
      const line2 = getLine(
        mark.buffer,
        lineStarts[foundLineNo + i],
        lineEnds[foundLineNo + i],
        mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
        maxLineLength
      );
      result += common2.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line2.str + "\n";
    }
    return result.replace(/\n$/, "");
  }
  snippet = makeSnippet;
  return snippet;
}
var type;
var hasRequiredType;
function requireType() {
  if (hasRequiredType) return type;
  hasRequiredType = 1;
  const YAMLException2 = requireException();
  const TYPE_CONSTRUCTOR_OPTIONS = [
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
  const YAML_NODE_KINDS = [
    "scalar",
    "sequence",
    "mapping"
  ];
  function compileStyleAliases(map2) {
    const result = {};
    if (map2 !== null) {
      Object.keys(map2).forEach(function(style) {
        map2[style].forEach(function(alias) {
          result[String(alias)] = style;
        });
      });
    }
    return result;
  }
  function Type2(tag, options) {
    options = options || {};
    Object.keys(options).forEach(function(name) {
      if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
        throw new YAMLException2('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
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
      throw new YAMLException2('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
    }
  }
  type = Type2;
  return type;
}
var schema;
var hasRequiredSchema;
function requireSchema() {
  if (hasRequiredSchema) return schema;
  hasRequiredSchema = 1;
  const YAMLException2 = requireException();
  const Type2 = requireType();
  function compileList(schema2, name) {
    const result = [];
    schema2[name].forEach(function(currentType) {
      let newIndex = result.length;
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
    const result = {
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
    };
    function collectType(type2) {
      if (type2.multi) {
        result.multi[type2.kind].push(type2);
        result.multi["fallback"].push(type2);
      } else {
        result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
      }
    }
    for (let index = 0, length = arguments.length; index < length; index += 1) {
      arguments[index].forEach(collectType);
    }
    return result;
  }
  function Schema2(definition) {
    return this.extend(definition);
  }
  Schema2.prototype.extend = function extend(definition) {
    let implicit = [];
    let explicit = [];
    if (definition instanceof Type2) {
      explicit.push(definition);
    } else if (Array.isArray(definition)) {
      explicit = explicit.concat(definition);
    } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
      if (definition.implicit) implicit = implicit.concat(definition.implicit);
      if (definition.explicit) explicit = explicit.concat(definition.explicit);
    } else {
      throw new YAMLException2("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
    }
    implicit.forEach(function(type2) {
      if (!(type2 instanceof Type2)) {
        throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
      if (type2.loadKind && type2.loadKind !== "scalar") {
        throw new YAMLException2("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
      }
      if (type2.multi) {
        throw new YAMLException2("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
      }
    });
    explicit.forEach(function(type2) {
      if (!(type2 instanceof Type2)) {
        throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
    });
    const result = Object.create(Schema2.prototype);
    result.implicit = (this.implicit || []).concat(implicit);
    result.explicit = (this.explicit || []).concat(explicit);
    result.compiledImplicit = compileList(result, "implicit");
    result.compiledExplicit = compileList(result, "explicit");
    result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
    return result;
  };
  schema = Schema2;
  return schema;
}
var str;
var hasRequiredStr;
function requireStr() {
  if (hasRequiredStr) return str;
  hasRequiredStr = 1;
  const Type2 = requireType();
  str = new Type2("tag:yaml.org,2002:str", {
    kind: "scalar",
    construct: function(data) {
      return data !== null ? data : "";
    }
  });
  return str;
}
var seq;
var hasRequiredSeq;
function requireSeq() {
  if (hasRequiredSeq) return seq;
  hasRequiredSeq = 1;
  const Type2 = requireType();
  seq = new Type2("tag:yaml.org,2002:seq", {
    kind: "sequence",
    construct: function(data) {
      return data !== null ? data : [];
    }
  });
  return seq;
}
var map;
var hasRequiredMap;
function requireMap() {
  if (hasRequiredMap) return map;
  hasRequiredMap = 1;
  const Type2 = requireType();
  map = new Type2("tag:yaml.org,2002:map", {
    kind: "mapping",
    construct: function(data) {
      return data !== null ? data : {};
    }
  });
  return map;
}
var failsafe;
var hasRequiredFailsafe;
function requireFailsafe() {
  if (hasRequiredFailsafe) return failsafe;
  hasRequiredFailsafe = 1;
  const Schema2 = requireSchema();
  failsafe = new Schema2({
    explicit: [
      requireStr(),
      requireSeq(),
      requireMap()
    ]
  });
  return failsafe;
}
var _null;
var hasRequired_null;
function require_null() {
  if (hasRequired_null) return _null;
  hasRequired_null = 1;
  const Type2 = requireType();
  function resolveYamlNull(data) {
    if (data === null) return true;
    const max = data.length;
    return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
  }
  function constructYamlNull() {
    return null;
  }
  function isNull(object) {
    return object === null;
  }
  _null = new Type2("tag:yaml.org,2002:null", {
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
  return _null;
}
var bool;
var hasRequiredBool;
function requireBool() {
  if (hasRequiredBool) return bool;
  hasRequiredBool = 1;
  const Type2 = requireType();
  function resolveYamlBoolean(data) {
    if (data === null) return false;
    const max = data.length;
    return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
  }
  function constructYamlBoolean(data) {
    return data === "true" || data === "True" || data === "TRUE";
  }
  function isBoolean(object) {
    return Object.prototype.toString.call(object) === "[object Boolean]";
  }
  bool = new Type2("tag:yaml.org,2002:bool", {
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
  return bool;
}
var int;
var hasRequiredInt;
function requireInt() {
  if (hasRequiredInt) return int;
  hasRequiredInt = 1;
  const common2 = requireCommon();
  const Type2 = requireType();
  function isHexCode(c) {
    return c >= 48 && c <= 57 || c >= 65 && c <= 70 || c >= 97 && c <= 102;
  }
  function isOctCode(c) {
    return c >= 48 && c <= 55;
  }
  function isDecCode(c) {
    return c >= 48 && c <= 57;
  }
  function resolveYamlInteger(data) {
    if (data === null) return false;
    const max = data.length;
    let index = 0;
    let hasDigits = false;
    if (!max) return false;
    let ch = data[index];
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
          if (ch !== "0" && ch !== "1") return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
      if (ch === "x") {
        index++;
        for (; index < max; index++) {
          if (!isHexCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
      if (ch === "o") {
        index++;
        for (; index < max; index++) {
          if (!isOctCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
    }
    for (; index < max; index++) {
      if (!isDecCode(data.charCodeAt(index))) {
        return false;
      }
      hasDigits = true;
    }
    if (!hasDigits) return false;
    return isFinite(parseYamlInteger(data));
  }
  function parseYamlInteger(data) {
    let value = data;
    let sign = 1;
    let ch = value[0];
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
  function constructYamlInteger(data) {
    return parseYamlInteger(data);
  }
  function isInteger(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common2.isNegativeZero(object));
  }
  int = new Type2("tag:yaml.org,2002:int", {
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
  return int;
}
var float;
var hasRequiredFloat;
function requireFloat() {
  if (hasRequiredFloat) return float;
  hasRequiredFloat = 1;
  const common2 = requireCommon();
  const Type2 = requireType();
  const YAML_FLOAT_PATTERN = new RegExp(
    // 2.5e4, 2.5 and integers
    "^(?:[-+]?(?:[0-9]+)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
  );
  const YAML_FLOAT_SPECIAL_PATTERN = new RegExp(
    "^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
  );
  function resolveYamlFloat(data) {
    if (data === null) return false;
    if (!YAML_FLOAT_PATTERN.test(data)) {
      return false;
    }
    if (isFinite(parseFloat(data, 10))) {
      return true;
    }
    return YAML_FLOAT_SPECIAL_PATTERN.test(data);
  }
  function constructYamlFloat(data) {
    let value = data.toLowerCase();
    const sign = value[0] === "-" ? -1 : 1;
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
  const SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
  function representYamlFloat(object, style) {
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
    } else if (common2.isNegativeZero(object)) {
      return "-0.0";
    }
    const res = object.toString(10);
    return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
  }
  function isFloat(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common2.isNegativeZero(object));
  }
  float = new Type2("tag:yaml.org,2002:float", {
    kind: "scalar",
    resolve: resolveYamlFloat,
    construct: constructYamlFloat,
    predicate: isFloat,
    represent: representYamlFloat,
    defaultStyle: "lowercase"
  });
  return float;
}
var json;
var hasRequiredJson;
function requireJson() {
  if (hasRequiredJson) return json;
  hasRequiredJson = 1;
  json = requireFailsafe().extend({
    implicit: [
      require_null(),
      requireBool(),
      requireInt(),
      requireFloat()
    ]
  });
  return json;
}
var core;
var hasRequiredCore;
function requireCore() {
  if (hasRequiredCore) return core;
  hasRequiredCore = 1;
  core = requireJson();
  return core;
}
var timestamp;
var hasRequiredTimestamp;
function requireTimestamp() {
  if (hasRequiredTimestamp) return timestamp;
  hasRequiredTimestamp = 1;
  const Type2 = requireType();
  const YAML_DATE_REGEXP = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
  );
  const YAML_TIMESTAMP_REGEXP = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
  );
  function resolveYamlTimestamp(data) {
    if (data === null) return false;
    if (YAML_DATE_REGEXP.exec(data) !== null) return true;
    if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
    return false;
  }
  function constructYamlTimestamp(data) {
    let fraction = 0;
    let delta = null;
    let match = YAML_DATE_REGEXP.exec(data);
    if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
    if (match === null) throw new Error("Date resolve error");
    const year = +match[1];
    const month = +match[2] - 1;
    const day = +match[3];
    if (!match[4]) {
      return new Date(Date.UTC(year, month, day));
    }
    const hour = +match[4];
    const minute = +match[5];
    const second = +match[6];
    if (match[7]) {
      fraction = match[7].slice(0, 3);
      while (fraction.length < 3) {
        fraction += "0";
      }
      fraction = +fraction;
    }
    if (match[9]) {
      const tzHour = +match[10];
      const tzMinute = +(match[11] || 0);
      delta = (tzHour * 60 + tzMinute) * 6e4;
      if (match[9] === "-") delta = -delta;
    }
    const date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
    if (delta) date.setTime(date.getTime() - delta);
    return date;
  }
  function representYamlTimestamp(object) {
    return object.toISOString();
  }
  timestamp = new Type2("tag:yaml.org,2002:timestamp", {
    kind: "scalar",
    resolve: resolveYamlTimestamp,
    construct: constructYamlTimestamp,
    instanceOf: Date,
    represent: representYamlTimestamp
  });
  return timestamp;
}
var merge;
var hasRequiredMerge;
function requireMerge() {
  if (hasRequiredMerge) return merge;
  hasRequiredMerge = 1;
  const Type2 = requireType();
  function resolveYamlMerge(data) {
    return data === "<<" || data === null;
  }
  merge = new Type2("tag:yaml.org,2002:merge", {
    kind: "scalar",
    resolve: resolveYamlMerge
  });
  return merge;
}
var binary;
var hasRequiredBinary;
function requireBinary() {
  if (hasRequiredBinary) return binary;
  hasRequiredBinary = 1;
  const Type2 = requireType();
  const BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
  function resolveYamlBinary(data) {
    if (data === null) return false;
    let bitlen = 0;
    const max = data.length;
    const map2 = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      const code = map2.indexOf(data.charAt(idx));
      if (code > 64) continue;
      if (code < 0) return false;
      bitlen += 6;
    }
    return bitlen % 8 === 0;
  }
  function constructYamlBinary(data) {
    const input = data.replace(/[\r\n=]/g, "");
    const max = input.length;
    const map2 = BASE64_MAP;
    let bits = 0;
    const result = [];
    for (let idx = 0; idx < max; idx++) {
      if (idx % 4 === 0 && idx) {
        result.push(bits >> 16 & 255);
        result.push(bits >> 8 & 255);
        result.push(bits & 255);
      }
      bits = bits << 6 | map2.indexOf(input.charAt(idx));
    }
    const tailbits = max % 4 * 6;
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
    let result = "";
    let bits = 0;
    const max = object.length;
    const map2 = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      if (idx % 3 === 0 && idx) {
        result += map2[bits >> 18 & 63];
        result += map2[bits >> 12 & 63];
        result += map2[bits >> 6 & 63];
        result += map2[bits & 63];
      }
      bits = (bits << 8) + object[idx];
    }
    const tail = max % 3;
    if (tail === 0) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    } else if (tail === 2) {
      result += map2[bits >> 10 & 63];
      result += map2[bits >> 4 & 63];
      result += map2[bits << 2 & 63];
      result += map2[64];
    } else if (tail === 1) {
      result += map2[bits >> 2 & 63];
      result += map2[bits << 4 & 63];
      result += map2[64];
      result += map2[64];
    }
    return result;
  }
  function isBinary(obj) {
    return Object.prototype.toString.call(obj) === "[object Uint8Array]";
  }
  binary = new Type2("tag:yaml.org,2002:binary", {
    kind: "scalar",
    resolve: resolveYamlBinary,
    construct: constructYamlBinary,
    predicate: isBinary,
    represent: representYamlBinary
  });
  return binary;
}
var omap;
var hasRequiredOmap;
function requireOmap() {
  if (hasRequiredOmap) return omap;
  hasRequiredOmap = 1;
  const Type2 = requireType();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const _toString = Object.prototype.toString;
  function resolveYamlOmap(data) {
    if (data === null) return true;
    const objectKeys = {};
    const object = data;
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      let pairHasKey = false;
      if (_toString.call(pair) !== "[object Object]") return false;
      let pairKey;
      for (pairKey in pair) {
        if (_hasOwnProperty.call(pair, pairKey)) {
          if (!pairHasKey) pairHasKey = true;
          else return false;
        }
      }
      if (!pairHasKey) return false;
      if (_hasOwnProperty.call(objectKeys, pairKey)) return false;
      Object.defineProperty(objectKeys, pairKey, { value: true });
    }
    return true;
  }
  function constructYamlOmap(data) {
    return data !== null ? data : [];
  }
  omap = new Type2("tag:yaml.org,2002:omap", {
    kind: "sequence",
    resolve: resolveYamlOmap,
    construct: constructYamlOmap
  });
  return omap;
}
var pairs;
var hasRequiredPairs;
function requirePairs() {
  if (hasRequiredPairs) return pairs;
  hasRequiredPairs = 1;
  const Type2 = requireType();
  const _toString = Object.prototype.toString;
  function resolveYamlPairs(data) {
    if (data === null) return true;
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      if (_toString.call(pair) !== "[object Object]") return false;
      const keys = Object.keys(pair);
      if (keys.length !== 1) return false;
      result[index] = [keys[0], pair[keys[0]]];
    }
    return true;
  }
  function constructYamlPairs(data) {
    if (data === null) return [];
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      const keys = Object.keys(pair);
      result[index] = [keys[0], pair[keys[0]]];
    }
    return result;
  }
  pairs = new Type2("tag:yaml.org,2002:pairs", {
    kind: "sequence",
    resolve: resolveYamlPairs,
    construct: constructYamlPairs
  });
  return pairs;
}
var set;
var hasRequiredSet;
function requireSet() {
  if (hasRequiredSet) return set;
  hasRequiredSet = 1;
  const Type2 = requireType();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  function resolveYamlSet(data) {
    if (data === null) return true;
    const object = data;
    for (const key in object) {
      if (_hasOwnProperty.call(object, key)) {
        if (object[key] !== null) return false;
      }
    }
    return true;
  }
  function constructYamlSet(data) {
    return data !== null ? data : {};
  }
  set = new Type2("tag:yaml.org,2002:set", {
    kind: "mapping",
    resolve: resolveYamlSet,
    construct: constructYamlSet
  });
  return set;
}
var _default;
var hasRequired_default;
function require_default() {
  if (hasRequired_default) return _default;
  hasRequired_default = 1;
  _default = requireCore().extend({
    implicit: [
      requireTimestamp(),
      requireMerge()
    ],
    explicit: [
      requireBinary(),
      requireOmap(),
      requirePairs(),
      requireSet()
    ]
  });
  return _default;
}
var hasRequiredLoader;
function requireLoader() {
  if (hasRequiredLoader) return loader;
  hasRequiredLoader = 1;
  const common2 = requireCommon();
  const YAMLException2 = requireException();
  const makeSnippet = requireSnippet();
  const DEFAULT_SCHEMA2 = require_default();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const CONTEXT_FLOW_IN = 1;
  const CONTEXT_FLOW_OUT = 2;
  const CONTEXT_BLOCK_IN = 3;
  const CONTEXT_BLOCK_OUT = 4;
  const CHOMPING_CLIP = 1;
  const CHOMPING_STRIP = 2;
  const CHOMPING_KEEP = 3;
  const PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
  const PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
  const PATTERN_FLOW_INDICATORS = /[,\[\]{}]/;
  const PATTERN_TAG_HANDLE = /^(?:!|!!|![0-9A-Za-z-]+!)$/;
  const PATTERN_TAG_URI = /^(?:!|[^,\[\]{}])(?:%[0-9a-f]{2}|[0-9a-z\-#;/?:@&=+$,_.!~*'()\[\]])*$/i;
  function _class(obj) {
    return Object.prototype.toString.call(obj);
  }
  function isEol(c) {
    return c === 10 || c === 13;
  }
  function isWhiteSpace(c) {
    return c === 9 || c === 32;
  }
  function isWsOrEol(c) {
    return c === 9 || c === 32 || c === 10 || c === 13;
  }
  function isFlowIndicator(c) {
    return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
  }
  function fromHexCode(c) {
    if (c >= 48 && c <= 57) {
      return c - 48;
    }
    const lc = c | 32;
    if (lc >= 97 && lc <= 102) {
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
    if (c >= 48 && c <= 57) {
      return c - 48;
    }
    return -1;
  }
  function simpleEscapeSequence(c) {
    switch (c) {
      case 48:
        return "\0";
      case 97:
        return "\x07";
      case 98:
        return "\b";
      case 116:
        return "	";
      case 9:
        return "	";
      case 110:
        return "\n";
      case 118:
        return "\v";
      case 102:
        return "\f";
      case 114:
        return "\r";
      case 101:
        return "\x1B";
      case 32:
        return " ";
      case 34:
        return '"';
      case 47:
        return "/";
      case 92:
        return "\\";
      case 78:
        return "\x85";
      case 95:
        return "\xA0";
      case 76:
        return "\u2028";
      case 80:
        return "\u2029";
      default:
        return "";
    }
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
  function setProperty(object, key, value) {
    if (key === "__proto__") {
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value
      });
    } else {
      object[key] = value;
    }
  }
  const simpleEscapeCheck = new Array(256);
  const simpleEscapeMap = new Array(256);
  for (let i = 0; i < 256; i++) {
    simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
    simpleEscapeMap[i] = simpleEscapeSequence(i);
  }
  function State(input, options) {
    this.input = input;
    this.filename = options["filename"] || null;
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.onWarning = options["onWarning"] || null;
    this.legacy = options["legacy"] || false;
    this.json = options["json"] || false;
    this.listener = options["listener"] || null;
    this.maxDepth = typeof options["maxDepth"] === "number" ? options["maxDepth"] : 100;
    this.maxTotalMergeKeys = typeof options["maxTotalMergeKeys"] === "number" ? options["maxTotalMergeKeys"] : 1e4;
    this.implicitTypes = this.schema.compiledImplicit;
    this.typeMap = this.schema.compiledTypeMap;
    this.length = input.length;
    this.position = 0;
    this.line = 0;
    this.lineStart = 0;
    this.lineIndent = 0;
    this.depth = 0;
    this.totalMergeKeys = 0;
    this.firstTabInLine = -1;
    this.documents = [];
    this.anchorMapTransactions = [];
  }
  function generateError(state, message) {
    const mark = {
      name: state.filename,
      buffer: state.input.slice(0, -1),
      // omit trailing \0
      position: state.position,
      line: state.line,
      column: state.position - state.lineStart
    };
    mark.snippet = makeSnippet(mark);
    return new YAMLException2(message, mark);
  }
  function throwError(state, message) {
    throw generateError(state, message);
  }
  function throwWarning(state, message) {
    if (state.onWarning) {
      state.onWarning.call(null, generateError(state, message));
    }
  }
  function storeAnchor(state, name, value) {
    const transactions = state.anchorMapTransactions;
    if (transactions.length !== 0) {
      const transaction = transactions[transactions.length - 1];
      if (!_hasOwnProperty.call(transaction, name)) {
        transaction[name] = {
          existed: _hasOwnProperty.call(state.anchorMap, name),
          value: state.anchorMap[name]
        };
      }
    }
    state.anchorMap[name] = value;
  }
  function beginAnchorTransaction(state) {
    state.anchorMapTransactions.push(/* @__PURE__ */ Object.create(null));
  }
  function commitAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const transactions = state.anchorMapTransactions;
    if (transactions.length === 0) return;
    const parent = transactions[transactions.length - 1];
    const names = Object.keys(transaction);
    for (let index = 0, length = names.length; index < length; index += 1) {
      const name = names[index];
      if (!_hasOwnProperty.call(parent, name)) {
        parent[name] = transaction[name];
      }
    }
  }
  function rollbackAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const names = Object.keys(transaction);
    for (let index = names.length - 1; index >= 0; index -= 1) {
      const entry = transaction[names[index]];
      if (entry.existed) {
        state.anchorMap[names[index]] = entry.value;
      } else {
        delete state.anchorMap[names[index]];
      }
    }
  }
  function snapshotState(state) {
    return {
      position: state.position,
      line: state.line,
      lineStart: state.lineStart,
      lineIndent: state.lineIndent,
      firstTabInLine: state.firstTabInLine,
      tag: state.tag,
      anchor: state.anchor,
      kind: state.kind,
      result: state.result
    };
  }
  function restoreState(state, snapshot) {
    state.position = snapshot.position;
    state.line = snapshot.line;
    state.lineStart = snapshot.lineStart;
    state.lineIndent = snapshot.lineIndent;
    state.firstTabInLine = snapshot.firstTabInLine;
    state.tag = snapshot.tag;
    state.anchor = snapshot.anchor;
    state.kind = snapshot.kind;
    state.result = snapshot.result;
  }
  const directiveHandlers = {
    YAML: function handleYamlDirective(state, name, args) {
      if (state.version !== null) {
        throwError(state, "duplication of %YAML directive");
      }
      if (args.length !== 1) {
        throwError(state, "YAML directive accepts exactly one argument");
      }
      const match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
      if (match === null) {
        throwError(state, "ill-formed argument of the YAML directive");
      }
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
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
      let prefix;
      if (args.length !== 2) {
        throwError(state, "TAG directive accepts exactly two arguments");
      }
      const handle = args[0];
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
    if (start < end) {
      const _result = state.input.slice(start, end);
      if (checkJson) {
        for (let _position = 0, _length = _result.length; _position < _length; _position += 1) {
          const _character = _result.charCodeAt(_position);
          if (!(_character === 9 || _character >= 32 && _character <= 1114111)) {
            throwError(state, "expected valid JSON character");
          }
        }
      } else if (PATTERN_NON_PRINTABLE.test(_result)) {
        throwError(state, "the stream contains non-printable characters");
      }
      state.result += _result;
    }
  }
  function chargeMergeWork(state) {
    state.totalMergeKeys++;
    if (state.maxTotalMergeKeys !== -1 && state.totalMergeKeys > state.maxTotalMergeKeys) {
      throwError(state, "merge keys exceeded maxTotalMergeKeys (" + state.maxTotalMergeKeys + ")");
    }
  }
  function mergeMappings(state, destination, source, overridableKeys) {
    if (!common2.isObject(source)) {
      throwError(state, "cannot merge mappings; the provided source object is unacceptable");
    }
    chargeMergeWork(state);
    const sourceKeys = Object.keys(source);
    for (let index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
      const key = sourceKeys[index];
      chargeMergeWork(state);
      if (!_hasOwnProperty.call(destination, key)) {
        setProperty(destination, key, source[key]);
        overridableKeys[key] = true;
      }
    }
  }
  function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
    if (Array.isArray(keyNode)) {
      keyNode = Array.prototype.slice.call(keyNode);
      for (let index = 0, quantity = keyNode.length; index < quantity; index += 1) {
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
        if (valueNode.length > 100) {
          throwError(state, "abnormal merge sequence size");
        }
        for (let index = 0, quantity = valueNode.length; index < quantity; index += 1) {
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
      setProperty(_result, keyNode, valueNode);
      delete overridableKeys[keyNode];
    }
    return _result;
  }
  function readLineBreak(state) {
    const ch = state.input.charCodeAt(state.position);
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
    let lineBreaks = 0;
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      while (isWhiteSpace(ch)) {
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
      if (isEol(ch)) {
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
    let _position = state.position;
    let ch = state.input.charCodeAt(_position);
    if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
      _position += 3;
      ch = state.input.charCodeAt(_position);
      if (ch === 0 || isWsOrEol(ch)) {
        return true;
      }
    }
    return false;
  }
  function writeFoldedLines(state, count) {
    if (count === 1) {
      state.result += " ";
    } else if (count > 1) {
      state.result += common2.repeat("\n", count - 1);
    }
  }
  function readPlainScalar(state, nodeIndent, withinFlowCollection) {
    let captureStart;
    let captureEnd;
    let hasPendingContent;
    let _line;
    let _lineStart;
    let _lineIndent;
    const _kind = state.kind;
    const _result = state.result;
    let ch = state.input.charCodeAt(state.position);
    if (isWsOrEol(ch) || isFlowIndicator(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
      return false;
    }
    if (ch === 63 || ch === 45) {
      const following = state.input.charCodeAt(state.position + 1);
      if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
        return false;
      }
    }
    state.kind = "scalar";
    state.result = "";
    captureStart = captureEnd = state.position;
    hasPendingContent = false;
    while (ch !== 0) {
      if (ch === 58) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
          break;
        }
      } else if (ch === 35) {
        const preceding = state.input.charCodeAt(state.position - 1);
        if (isWsOrEol(preceding)) {
          break;
        }
      } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && isFlowIndicator(ch)) {
        break;
      } else if (isEol(ch)) {
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
      if (!isWhiteSpace(ch)) {
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
    let captureStart;
    let captureEnd;
    let ch = state.input.charCodeAt(state.position);
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
      } else if (isEol(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a single quoted scalar");
      } else {
        state.position++;
        if (!isWhiteSpace(ch)) {
          captureEnd = state.position;
        }
      }
    }
    throwError(state, "unexpected end of the stream within a single quoted scalar");
  }
  function readDoubleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
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
        if (isEol(ch)) {
          skipSeparationSpace(state, false, nodeIndent);
        } else if (ch < 256 && simpleEscapeCheck[ch]) {
          state.result += simpleEscapeMap[ch];
          state.position++;
        } else if ((tmp = escapedHexLen(ch)) > 0) {
          let hexLength = tmp;
          let hexResult = 0;
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
      } else if (isEol(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a double quoted scalar");
      } else {
        state.position++;
        if (!isWhiteSpace(ch)) {
          captureEnd = state.position;
        }
      }
    }
    throwError(state, "unexpected end of the stream within a double quoted scalar");
  }
  function readFlowCollection(state, nodeIndent) {
    let readNext = true;
    let _line;
    let _lineStart;
    let _pos;
    const _tag = state.tag;
    let _result;
    const _anchor = state.anchor;
    let terminator;
    let isPair;
    let isExplicitPair;
    let isMapping;
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyNode;
    let keyTag;
    let valueNode;
    let ch = state.input.charCodeAt(state.position);
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
      storeAnchor(state, state.anchor, _result);
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
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following)) {
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
    let folding;
    let chomping = CHOMPING_CLIP;
    let didReadContent = false;
    let detectedIndent = false;
    let textIndent = nodeIndent;
    let emptyLines = 0;
    let atMoreIndented = false;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
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
    if (isWhiteSpace(ch)) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (isWhiteSpace(ch));
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (!isEol(ch) && ch !== 0);
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
      if (isEol(ch)) {
        emptyLines++;
        continue;
      }
      if (!detectedIndent && textIndent === 0) {
        throwError(state, "missing indentation for block scalar");
      }
      if (state.lineIndent < textIndent) {
        if (chomping === CHOMPING_KEEP) {
          state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        } else if (chomping === CHOMPING_CLIP) {
          if (didReadContent) {
            state.result += "\n";
          }
        }
        break;
      }
      if (folding) {
        if (isWhiteSpace(ch)) {
          atMoreIndented = true;
          state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        } else if (atMoreIndented) {
          atMoreIndented = false;
          state.result += common2.repeat("\n", emptyLines + 1);
        } else if (emptyLines === 0) {
          if (didReadContent) {
            state.result += " ";
          }
        } else {
          state.result += common2.repeat("\n", emptyLines);
        }
      } else {
        state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      }
      didReadContent = true;
      detectedIndent = true;
      emptyLines = 0;
      const captureStart = state.position;
      while (!isEol(ch) && ch !== 0) {
        ch = state.input.charCodeAt(++state.position);
      }
      captureSegment(state, captureStart, state.position, false);
    }
    return true;
  }
  function readBlockSequence(state, nodeIndent) {
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = [];
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      if (ch !== 45) {
        break;
      }
      const following = state.input.charCodeAt(state.position + 1);
      if (!isWsOrEol(following)) {
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
      const _line = state.line;
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
    let allowCompact;
    let _keyLine;
    let _keyLineStart;
    let _keyPos;
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = {};
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyTag = null;
    let keyNode = null;
    let valueNode = null;
    let atExplicitKey = false;
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (!atExplicitKey && state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      const following = state.input.charCodeAt(state.position + 1);
      const _line = state.line;
      if ((ch === 63 || ch === 58) && isWsOrEol(following)) {
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
          while (isWhiteSpace(ch)) {
            ch = state.input.charCodeAt(++state.position);
          }
          if (ch === 58) {
            ch = state.input.charCodeAt(++state.position);
            if (!isWsOrEol(ch)) {
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
    let isVerbatim = false;
    let isNamed = false;
    let tagHandle;
    let tagName;
    let ch = state.input.charCodeAt(state.position);
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
    let _position = state.position;
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
      while (ch !== 0 && !isWsOrEol(ch)) {
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
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 38) return false;
    if (state.anchor !== null) {
      throwError(state, "duplication of an anchor property");
    }
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an anchor node must contain at least one character");
    }
    state.anchor = state.input.slice(_position, state.position);
    return true;
  }
  function readAlias(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 42) return false;
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an alias node must contain at least one character");
    }
    const alias = state.input.slice(_position, state.position);
    if (!_hasOwnProperty.call(state.anchorMap, alias)) {
      throwError(state, 'unidentified alias "' + alias + '"');
    }
    state.result = state.anchorMap[alias];
    skipSeparationSpace(state, true, -1);
    return true;
  }
  function tryReadBlockMappingFromProperty(state, propertyStart, nodeIndent, flowIndent) {
    const fallbackState = snapshotState(state);
    beginAnchorTransaction(state);
    restoreState(state, propertyStart);
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    if (readBlockMapping(state, nodeIndent, flowIndent) && state.kind === "mapping") {
      commitAnchorTransaction(state);
      return true;
    }
    rollbackAnchorTransaction(state);
    restoreState(state, fallbackState);
    return false;
  }
  function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
    let allowBlockScalars;
    let allowBlockCollections;
    let indentStatus = 1;
    let atNewLine = false;
    let hasContent = false;
    let propertyStart = null;
    let type2;
    let flowIndent;
    let blockIndent;
    if (state.depth >= state.maxDepth) {
      throwError(state, "nesting exceeded maxDepth (" + state.maxDepth + ")");
    }
    state.depth += 1;
    if (state.listener !== null) {
      state.listener("open", state);
    }
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    const allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
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
      while (true) {
        const ch = state.input.charCodeAt(state.position);
        const propertyState = snapshotState(state);
        if (atNewLine && (ch === 33 && state.tag !== null || ch === 38 && state.anchor !== null)) {
          break;
        }
        if (!readTagProperty(state) && !readAnchorProperty(state)) {
          break;
        }
        if (propertyStart === null) {
          propertyStart = propertyState;
        }
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
          const ch = state.input.charCodeAt(state.position);
          if (propertyStart !== null && allowBlockStyles && !allowBlockCollections && ch !== 124 && ch !== 62 && tryReadBlockMappingFromProperty(
            state,
            propertyStart,
            propertyStart.position - propertyStart.lineStart,
            flowIndent
          )) {
            hasContent = true;
          } else if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
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
            storeAnchor(state, state.anchor, state.result);
          }
        }
      } else if (indentStatus === 0) {
        hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
      }
    }
    if (state.tag === null) {
      if (state.anchor !== null) {
        storeAnchor(state, state.anchor, state.result);
      }
    } else if (state.tag === "?") {
      if (state.result !== null && state.kind !== "scalar") {
        throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
      }
      for (let typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
        type2 = state.implicitTypes[typeIndex];
        if (type2.resolve(state.result)) {
          state.result = type2.construct(state.result);
          state.tag = type2.tag;
          if (state.anchor !== null) {
            storeAnchor(state, state.anchor, state.result);
          }
          break;
        }
      }
    } else if (state.tag !== "!") {
      if (_hasOwnProperty.call(state.typeMap[state.kind || "fallback"], state.tag)) {
        type2 = state.typeMap[state.kind || "fallback"][state.tag];
      } else {
        type2 = null;
        const typeList = state.typeMap.multi[state.kind || "fallback"];
        for (let typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
          if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
            type2 = typeList[typeIndex];
            break;
          }
        }
      }
      if (!type2) {
        throwError(state, "unknown tag !<" + state.tag + ">");
      }
      if (state.result !== null && type2.kind !== state.kind) {
        throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
      }
      if (!type2.resolve(state.result, state.tag)) {
        throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
      } else {
        state.result = type2.construct(state.result, state.tag);
        if (state.anchor !== null) {
          storeAnchor(state, state.anchor, state.result);
        }
      }
    }
    if (state.listener !== null) {
      state.listener("close", state);
    }
    state.depth -= 1;
    return state.tag !== null || state.anchor !== null || hasContent;
  }
  function readDocument(state) {
    const documentStart = state.position;
    let hasDirectives = false;
    let ch;
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
      let _position = state.position;
      while (ch !== 0 && !isWsOrEol(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      const directiveName = state.input.slice(_position, state.position);
      const directiveArgs = [];
      if (directiveName.length < 1) {
        throwError(state, "directive name must not be less than one character in length");
      }
      while (ch !== 0) {
        while (isWhiteSpace(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 35) {
          do {
            ch = state.input.charCodeAt(++state.position);
          } while (ch !== 0 && !isEol(ch));
          break;
        }
        if (isEol(ch)) break;
        _position = state.position;
        while (ch !== 0 && !isWsOrEol(ch)) {
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
    const state = new State(input, options);
    const nullpos = input.indexOf("\0");
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
  function loadAll2(input, iterator, options) {
    if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
      options = iterator;
      iterator = null;
    }
    const documents = loadDocuments(input, options);
    if (typeof iterator !== "function") {
      return documents;
    }
    for (let index = 0, length = documents.length; index < length; index += 1) {
      iterator(documents[index]);
    }
  }
  function load2(input, options) {
    const documents = loadDocuments(input, options);
    if (documents.length === 0) {
      return void 0;
    } else if (documents.length === 1) {
      return documents[0];
    }
    throw new YAMLException2("expected a single document in the stream, but found more");
  }
  loader.loadAll = loadAll2;
  loader.load = load2;
  return loader;
}
var dumper = {};
var hasRequiredDumper;
function requireDumper() {
  if (hasRequiredDumper) return dumper;
  hasRequiredDumper = 1;
  const common2 = requireCommon();
  const YAMLException2 = requireException();
  const DEFAULT_SCHEMA2 = require_default();
  const _toString = Object.prototype.toString;
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const CHAR_BOM = 65279;
  const CHAR_TAB = 9;
  const CHAR_LINE_FEED = 10;
  const CHAR_CARRIAGE_RETURN = 13;
  const CHAR_SPACE = 32;
  const CHAR_EXCLAMATION = 33;
  const CHAR_DOUBLE_QUOTE = 34;
  const CHAR_SHARP = 35;
  const CHAR_PERCENT = 37;
  const CHAR_AMPERSAND = 38;
  const CHAR_SINGLE_QUOTE = 39;
  const CHAR_ASTERISK = 42;
  const CHAR_COMMA = 44;
  const CHAR_MINUS = 45;
  const CHAR_COLON = 58;
  const CHAR_EQUALS = 61;
  const CHAR_GREATER_THAN = 62;
  const CHAR_QUESTION = 63;
  const CHAR_COMMERCIAL_AT = 64;
  const CHAR_LEFT_SQUARE_BRACKET = 91;
  const CHAR_RIGHT_SQUARE_BRACKET = 93;
  const CHAR_GRAVE_ACCENT = 96;
  const CHAR_LEFT_CURLY_BRACKET = 123;
  const CHAR_VERTICAL_LINE = 124;
  const CHAR_RIGHT_CURLY_BRACKET = 125;
  const ESCAPE_SEQUENCES = {};
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
  const DEPRECATED_BOOLEANS_SYNTAX = [
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
  const DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
  function compileStyleMap(schema2, map2) {
    if (map2 === null) return {};
    const result = {};
    const keys = Object.keys(map2);
    for (let index = 0, length = keys.length; index < length; index += 1) {
      let tag = keys[index];
      let style = String(map2[tag]);
      if (tag.slice(0, 2) === "!!") {
        tag = "tag:yaml.org,2002:" + tag.slice(2);
      }
      const type2 = schema2.compiledTypeMap["fallback"][tag];
      if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
        style = type2.styleAliases[style];
      }
      result[tag] = style;
    }
    return result;
  }
  function encodeHex(character) {
    let handle;
    let length;
    const string = character.toString(16).toUpperCase();
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
      throw new YAMLException2("code point within a string may not be greater than 0xFFFFFFFF");
    }
    return "\\" + handle + common2.repeat("0", length - string.length) + string;
  }
  const QUOTING_TYPE_SINGLE = 1;
  const QUOTING_TYPE_DOUBLE = 2;
  function State(options) {
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.indent = Math.max(1, options["indent"] || 2);
    this.noArrayIndent = options["noArrayIndent"] || false;
    this.skipInvalid = options["skipInvalid"] || false;
    this.flowLevel = common2.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
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
    const ind = common2.repeat(" ", spaces);
    let position = 0;
    let result = "";
    const length = string.length;
    while (position < length) {
      let line;
      const next = string.indexOf("\n", position);
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
    return "\n" + common2.repeat(" ", state.indent * level);
  }
  function testImplicitResolving(state, str2) {
    for (let index = 0, length = state.implicitTypes.length; index < length; index += 1) {
      const type2 = state.implicitTypes[index];
      if (type2.resolve(str2)) {
        return true;
      }
    }
    return false;
  }
  function isWhitespace(c) {
    return c === CHAR_SPACE || c === CHAR_TAB;
  }
  function isPrintable(c) {
    return c >= 32 && c <= 126 || c >= 161 && c <= 55295 && c !== 8232 && c !== 8233 || c >= 57344 && c <= 65533 && c !== CHAR_BOM || c >= 65536 && c <= 1114111;
  }
  function isNsCharOrWhitespace(c) {
    return isPrintable(c) && c !== CHAR_BOM && // - b-char
    c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
  }
  function isPlainSafe(c, prev, inblock) {
    const cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
    const cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
    return (
      // ns-plain-safe
      (inblock ? cIsNsCharOrWhitespace : cIsNsCharOrWhitespace && // - c-flow-indicator
      c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && // ns-plain-char
      c !== CHAR_SHARP && // false on '#'
      !(prev === CHAR_COLON && !cIsNsChar) || // false on ': '
      isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || // change to true on '[^ ]#'
      prev === CHAR_COLON && cIsNsChar
    );
  }
  function isPlainSafeFirst(c) {
    return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && // - s-white
    // - (c-indicator ::=
    // “-” | “?” | “:” | “,” | “[” | “]” | “{” | “}”
    c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && // | “#” | “&” | “*” | “!” | “|” | “=” | “>” | “'” | “"”
    c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && // | “%” | “@” | “`”)
    c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
  }
  function isPlainSafeLast(c) {
    return !isWhitespace(c) && c !== CHAR_COLON;
  }
  function codePointAt(string, pos) {
    const first = string.charCodeAt(pos);
    let second;
    if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
      second = string.charCodeAt(pos + 1);
      if (second >= 56320 && second <= 57343) {
        return (first - 55296) * 1024 + second - 56320 + 65536;
      }
    }
    return first;
  }
  function needIndentIndicator(string) {
    const leadingSpaceRe = /^\n* /;
    return leadingSpaceRe.test(string);
  }
  const STYLE_PLAIN = 1;
  const STYLE_SINGLE = 2;
  const STYLE_LITERAL = 3;
  const STYLE_FOLDED = 4;
  const STYLE_DOUBLE = 5;
  function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
    let i;
    let char = 0;
    let prevChar = null;
    let hasLineBreak = false;
    let hasFoldableLine = false;
    const shouldTrackWidth = lineWidth !== -1;
    let previousLineBreak = -1;
    let plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
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
      const indent = state.indent * Math.max(1, level);
      const lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
      const singleLineOnly = iskey || // No block styles in flow mode.
      state.flowLevel > -1 && level >= state.flowLevel;
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
          return '"' + escapeString(string) + '"';
        default:
          throw new YAMLException2("impossible error: invalid scalar style");
      }
    }();
  }
  function blockHeader(string, indentPerLevel) {
    const indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
    const clip = string[string.length - 1] === "\n";
    const keep = clip && (string[string.length - 2] === "\n" || string === "\n");
    const chomp = keep ? "+" : clip ? "" : "-";
    return indentIndicator + chomp + "\n";
  }
  function dropEndingNewline(string) {
    return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
  }
  function foldString(string, width) {
    const lineRe = /(\n+)([^\n]*)/g;
    let result = function() {
      let nextLF = string.indexOf("\n");
      nextLF = nextLF !== -1 ? nextLF : string.length;
      lineRe.lastIndex = nextLF;
      return foldLine(string.slice(0, nextLF), width);
    }();
    let prevMoreIndented = string[0] === "\n" || string[0] === " ";
    let moreIndented;
    let match;
    while (match = lineRe.exec(string)) {
      const prefix = match[1];
      const line = match[2];
      moreIndented = line[0] === " ";
      result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
      prevMoreIndented = moreIndented;
    }
    return result;
  }
  function foldLine(line, width) {
    if (line === "" || line[0] === " ") return line;
    const breakRe = / [^ ]/g;
    let match;
    let start = 0;
    let end;
    let curr = 0;
    let next = 0;
    let result = "";
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
    let result = "";
    let char = 0;
    for (let i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      const escapeSeq = ESCAPE_SEQUENCES[char];
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
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
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
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
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
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (_result !== "") pairBuffer += ", ";
      if (state.condenseFlow) pairBuffer += '"';
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
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
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    if (state.sortKeys === true) {
      objectKeyList.sort();
    } else if (typeof state.sortKeys === "function") {
      objectKeyList.sort(state.sortKeys);
    } else if (state.sortKeys) {
      throw new YAMLException2("sortKeys must be a boolean or a function");
    }
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (!compact || _result !== "") {
        pairBuffer += generateNextLine(state, level);
      }
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level + 1, objectKey, true, true, true)) {
        continue;
      }
      const explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
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
    const typeList = explicit ? state.explicitTypes : state.implicitTypes;
    for (let index = 0, length = typeList.length; index < length; index += 1) {
      const type2 = typeList[index];
      if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
        if (explicit) {
          if (type2.multi && type2.representName) {
            state.tag = type2.representName(object);
          } else {
            state.tag = type2.tag;
          }
        } else {
          state.tag = "?";
        }
        if (type2.represent) {
          const style = state.styleMap[type2.tag] || type2.defaultStyle;
          let _result;
          if (_toString.call(type2.represent) === "[object Function]") {
            _result = type2.represent(object, style);
          } else if (_hasOwnProperty.call(type2.represent, style)) {
            _result = type2.represent[style](object, style);
          } else {
            throw new YAMLException2("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
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
    const type2 = _toString.call(state.dump);
    const inblock = block;
    if (block) {
      block = state.flowLevel < 0 || state.flowLevel > level;
    }
    const objectOrArray = type2 === "[object Object]" || type2 === "[object Array]";
    let duplicateIndex;
    let duplicate;
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
      if (type2 === "[object Object]") {
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
      } else if (type2 === "[object Array]") {
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
      } else if (type2 === "[object String]") {
        if (state.tag !== "?") {
          writeScalar(state, state.dump, level, iskey, inblock);
        }
      } else if (type2 === "[object Undefined]") {
        return false;
      } else {
        if (state.skipInvalid) return false;
        throw new YAMLException2("unacceptable kind of an object to dump " + type2);
      }
      if (state.tag !== null && state.tag !== "?") {
        let tagStr = encodeURI(
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
    const objects = [];
    const duplicatesIndexes = [];
    inspectNode(object, objects, duplicatesIndexes);
    const length = duplicatesIndexes.length;
    for (let index = 0; index < length; index += 1) {
      state.duplicates.push(objects[duplicatesIndexes[index]]);
    }
    state.usedDuplicates = new Array(length);
  }
  function inspectNode(object, objects, duplicatesIndexes) {
    if (object !== null && typeof object === "object") {
      const index = objects.indexOf(object);
      if (index !== -1) {
        if (duplicatesIndexes.indexOf(index) === -1) {
          duplicatesIndexes.push(index);
        }
      } else {
        objects.push(object);
        if (Array.isArray(object)) {
          for (let i = 0, length = object.length; i < length; i += 1) {
            inspectNode(object[i], objects, duplicatesIndexes);
          }
        } else {
          const objectKeyList = Object.keys(object);
          for (let i = 0, length = objectKeyList.length; i < length; i += 1) {
            inspectNode(object[objectKeyList[i]], objects, duplicatesIndexes);
          }
        }
      }
    }
  }
  function dump2(input, options) {
    options = options || {};
    const state = new State(options);
    if (!state.noRefs) getDuplicateReferences(input, state);
    let value = input;
    if (state.replacer) {
      value = state.replacer.call({ "": value }, "", value);
    }
    if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
    return "";
  }
  dumper.dump = dump2;
  return dumper;
}
var hasRequiredJsYaml;
function requireJsYaml() {
  if (hasRequiredJsYaml) return jsYaml;
  hasRequiredJsYaml = 1;
  const loader2 = requireLoader();
  const dumper2 = requireDumper();
  function renamed(from, to) {
    return function() {
      throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
    };
  }
  jsYaml.Type = requireType();
  jsYaml.Schema = requireSchema();
  jsYaml.FAILSAFE_SCHEMA = requireFailsafe();
  jsYaml.JSON_SCHEMA = requireJson();
  jsYaml.CORE_SCHEMA = requireCore();
  jsYaml.DEFAULT_SCHEMA = require_default();
  jsYaml.load = loader2.load;
  jsYaml.loadAll = loader2.loadAll;
  jsYaml.dump = dumper2.dump;
  jsYaml.YAMLException = requireException();
  jsYaml.types = {
    binary: requireBinary(),
    float: requireFloat(),
    map: requireMap(),
    null: require_null(),
    pairs: requirePairs(),
    set: requireSet(),
    timestamp: requireTimestamp(),
    bool: requireBool(),
    int: requireInt(),
    merge: requireMerge(),
    omap: requireOmap(),
    seq: requireSeq(),
    str: requireStr()
  };
  jsYaml.safeLoad = renamed("safeLoad", "load");
  jsYaml.safeLoadAll = renamed("safeLoadAll", "loadAll");
  jsYaml.safeDump = renamed("safeDump", "dump");
  return jsYaml;
}
var jsYamlExports = requireJsYaml();
var yaml = /* @__PURE__ */ getDefaultExportFromCjs(jsYamlExports);
var {
  Type,
  Schema,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  load,
  loadAll,
  dump,
  YAMLException,
  types,
  safeLoad,
  safeLoadAll,
  safeDump
} = yaml;

// src/core/yaml.ts
function errText(e) {
  if (e instanceof YAMLException) {
    const first = String(e.message).split("\n")[0];
    return first;
  }
  return e.message;
}
function yamlToJson(text) {
  try {
    const value = load(text);
    if (value === void 0) return { ok: true, output: "" };
    return { ok: true, output: JSON.stringify(value, null, 2) };
  } catch (e) {
    return { ok: false, output: "", error: errText(e) };
  }
}
function jsonToYaml(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, output: "", error: `\u8F93\u5165\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${e.message}` };
  }
  try {
    const output = dump(value, { indent: 2, lineWidth: 120, noRefs: true });
    return { ok: true, output };
  } catch (e) {
    return { ok: false, output: "", error: errText(e) };
  }
}

// src/core/cronx.ts
var import_cron_parser = __toESM(require_parser());
var WEEKDAYS2 = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
var MONTHS = ["1\u6708", "2\u6708", "3\u6708", "4\u6708", "5\u6708", "6\u6708", "7\u6708", "8\u6708", "9\u6708", "10\u6708", "11\u6708", "12\u6708"];
function normDow(values) {
  return [...new Set(values.map((v) => v % 7))].sort((a, b) => a - b);
}
function fmtField(values, all, labelMap) {
  if (values.length === all) return "*";
  return values.map((v) => labelMap ? labelMap(v) : String(v)).join("\u3001");
}
function listCn(seg, labelMap) {
  if (seg === "*") return null;
  const items = seg.split(",");
  if (items.length > 4) return null;
  return items.map((it) => {
    const m = it.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (b - a <= 7) {
        const arr = [];
        for (let i = a; i <= b; i++) arr.push(labelMap ? labelMap(i) : String(i));
        return arr.join("\u3001");
      }
    }
    return labelMap && /^\d+$/.test(it) ? labelMap(Number(it)) : it;
  }).join("\u3001");
}
var pad2 = (n) => String(n).padStart(2, "0");
function describe(segments, hasSeconds) {
  const parts = hasSeconds ? segments : [void 0, ...segments];
  const secSeg = parts[0];
  const minSeg = parts[1] ?? "";
  const hourSeg = parts[2] ?? "";
  const domSeg = parts[3] ?? "";
  const monSeg = parts[4] ?? "";
  const dowSeg = parts[5] ?? "";
  const restAll = [domSeg, monSeg, dowSeg].every((s) => s === "*");
  const isList = (s) => s !== "*" && /^\d+(,\d+)*$/.test(s);
  if (minSeg === "*" && hourSeg === "*" && restAll && (secSeg === void 0 || secSeg === "0")) {
    return "\u6BCF\u5206\u949F";
  }
  if (/^\*\/\d+$/.test(minSeg ?? "") && hourSeg === "*" && restAll && (secSeg === void 0 || secSeg === "0")) {
    const step = Number(minSeg.split("/")[1]);
    return `\u6BCF ${step} \u5206\u949F`;
  }
  if (isList(minSeg) && hourSeg === "*" && restAll && (secSeg === void 0 || secSeg === "0")) {
    const mins = minSeg.split(",");
    if (mins.length <= 4) return `\u6BCF\u5C0F\u65F6\u7B2C ${mins.map((m) => pad2(Number(m))).join("\u3001")} \u5206`;
  }
  const singleTime = isList(minSeg) && minSeg.split(",").length === 1 && isList(hourSeg) && hourSeg.split(",").length === 1;
  if (singleTime && (secSeg === void 0 || secSeg === "0")) {
    const time = `${pad2(Number(hourSeg))}:${pad2(Number(minSeg))}`;
    const dowCn = listCn(dowSeg ?? "*", (d) => WEEKDAYS2[d % 7]);
    if (domSeg === "*" && monSeg === "*" && dowCn) return `\u6BCF${dowCn} ${time}`;
    const domCn = listCn(domSeg ?? "*");
    if (domCn && monSeg === "*" && (dowSeg === "*" || dowSeg === "?")) return `\u6BCF\u6708 ${domCn} \u65E5 ${time}`;
    const monCn = listCn(monSeg ?? "*", (m) => MONTHS[m - 1]);
    if (monCn && domCn && (dowSeg === "*" || dowSeg === "?")) return `\u6BCF\u5E74 ${monCn}\u7684 ${domCn} \u65E5 ${time}`;
    if (domSeg === "*" && monSeg === "*" && (dowSeg === "*" || dowSeg === "?")) return `\u6BCF\u5929 ${time}`;
  }
  return "";
}
function analyzeCron(expr, count = 5) {
  const trimmed = expr.trim();
  if (trimmed === "") return { ok: false, error: "\u8868\u8FBE\u5F0F\u4E3A\u7A7A", hasSeconds: false };
  const segs = trimmed.split(/\s+/);
  const hasSeconds = segs.length >= 6;
  if (segs.length !== 5 && segs.length !== 6) {
    return {
      ok: false,
      error: `\u5E94\u4E3A 5 \u6BB5\uFF08\u5206 \u65F6 \u65E5 \u6708 \u5468\uFF09\u6216 6 \u6BB5\uFF08\u79D2 \u5206 \u65F6 \u65E5 \u6708 \u5468\uFF09\uFF0C\u5B9E\u9645 ${segs.length} \u6BB5`,
      hasSeconds
    };
  }
  try {
    const interval = (0, import_cron_parser.parseExpression)(trimmed, { currentDate: /* @__PURE__ */ new Date() });
    const rawFields = interval.fields;
    const dow = normDow(rawFields.dayOfWeek);
    const next = [];
    const n = Math.max(1, Math.min(20, Math.floor(count) || 5));
    const cursor = (0, import_cron_parser.parseExpression)(trimmed, { currentDate: /* @__PURE__ */ new Date() });
    for (let i = 0; i < n; i++) {
      const d = cursor.next().toDate();
      next.push(
        `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${WEEKDAYS2[d.getDay()]}`
      );
    }
    return {
      ok: true,
      hasSeconds,
      fields: {
        second: hasSeconds ? fmtField(rawFields.second, 60) : void 0,
        minute: fmtField(rawFields.minute, 60),
        hour: fmtField(rawFields.hour, 24),
        dayOfMonth: fmtField(rawFields.dayOfMonth, 31),
        month: fmtField(rawFields.month, 12, (m) => MONTHS[m - 1]),
        dayOfWeek: fmtField(dow, 7, (d) => WEEKDAYS2[d % 7])
      },
      description: describe(segs, hasSeconds),
      next
    };
  } catch (e) {
    return { ok: false, error: `\u8868\u8FBE\u5F0F\u65E0\u6CD5\u89E3\u6790\uFF1A${e.message}`, hasSeconds };
  }
}

// src/core/regexx.ts
var MAX_MATCHES = 500;
function parseFlags(flags) {
  const valid = "dgimsuvy";
  const seen = /* @__PURE__ */ new Set();
  for (const ch of flags) {
    if (!valid.includes(ch)) return { ok: false, error: `\u975E\u6CD5\u6807\u5FD7\uFF1A${ch}\uFF08\u5408\u6CD5\uFF1A${valid}\uFF09` };
    if (seen.has(ch)) return { ok: false, error: `\u6807\u5FD7\u91CD\u590D\uFF1A${ch}` };
    seen.add(ch);
  }
  return { ok: true, flags };
}
function testRegex(pattern, flags, text) {
  const empty = { ok: true, flagsUsed: "", matches: [], truncated: false, segments: [] };
  if (pattern === "") return { ...empty, error: "\u6B63\u5219\u4E3A\u7A7A" };
  const f = parseFlags(flags);
  if (!f.ok) return { ...empty, ok: false, error: f.error };
  let re;
  try {
    re = new RegExp(pattern, f.flags);
  } catch (e) {
    return { ...empty, ok: false, error: `\u6B63\u5219\u65E0\u6CD5\u7F16\u8BD1\uFF1A${e.message}` };
  }
  const matches = [];
  const scan = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m;
  let guard = 0;
  while ((m = scan.exec(text)) !== null) {
    matches.push({
      index: m.index,
      end: m.index + m[0].length,
      match: m[0],
      groups: m.slice(1),
      namedGroups: m.groups ? { ...m.groups } : {}
    });
    if (m[0].length === 0) scan.lastIndex++;
    if (matches.length >= MAX_MATCHES) break;
    if (++guard > 1e6) break;
  }
  const truncated = matches.length >= MAX_MATCHES;
  const segments = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), isMatch: false, zeroLength: false });
    segments.push({ text: match.match, isMatch: true, zeroLength: match.match.length === 0 });
    cursor = Math.max(cursor, match.end);
    if (match.end === match.index) cursor = match.index + 1;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), isMatch: false, zeroLength: false });
  return { ok: true, flagsUsed: f.flags, matches, truncated, segments };
}
function previewReplace(pattern, flags, text, replacement) {
  if (pattern === "") return { ok: false, output: "", error: "\u6B63\u5219\u4E3A\u7A7A" };
  const f = parseFlags(flags);
  if (!f.ok) return { ok: false, output: "", error: f.error };
  try {
    const re = new RegExp(pattern, f.flags);
    return { ok: true, output: text.replace(re, replacement) };
  } catch (e) {
    return { ok: false, output: "", error: e.message };
  }
}

// src/core/case.ts
function splitWords(input) {
  return input.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter((w) => w.length > 0);
}
function convertCase(input) {
  const words = splitWords(input);
  const lower = words.map((w) => w.toLowerCase());
  const capitalize = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  return {
    words,
    camel: lower.map((w, i) => i === 0 ? w : capitalize(w)).join(""),
    pascal: lower.map(capitalize).join(""),
    snake: lower.join("_"),
    constant: lower.map((w) => w.toUpperCase()).join("_"),
    kebab: lower.join("-"),
    train: lower.map(capitalize).join("-"),
    dot: lower.join("."),
    title: words.map(capitalize).join(" "),
    lower: lower.join(" "),
    upper: lower.map((w) => w.toUpperCase()).join(" ")
  };
}

// src/core/radix.ts
var DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
function bigToBase(value, base) {
  if (value === 0n) return "0";
  const b = BigInt(base);
  let v = value;
  let out = "";
  while (v > 0n) {
    out = DIGITS[Number(v % b)] + out;
    v = v / b;
  }
  return out;
}
function convertRadix(input, fromBase) {
  const raw = input.trim();
  if (raw === "") return { ok: false, error: "\u8F93\u5165\u4E3A\u7A7A" };
  if (!Number.isInteger(fromBase) || fromBase < 2 || fromBase > 36) {
    return { ok: false, error: `\u6E90\u8FDB\u5236\u987B\u4E3A 2-36 \u7684\u6574\u6570\uFF0C\u5F53\u524D ${fromBase}` };
  }
  let negative = false;
  let body = raw.toLowerCase().replace(/[\s_]/g, "");
  if (body.startsWith("-")) {
    negative = true;
    body = body.slice(1);
  } else if (body.startsWith("+")) {
    body = body.slice(1);
  }
  if (body === "") return { ok: false, error: "\u6CA1\u6709\u6570\u5B57\u4F4D" };
  let acc = 0n;
  const base = BigInt(fromBase);
  for (const ch of body) {
    const d = DIGITS.indexOf(ch);
    if (d < 0) return { ok: false, error: `\u5B57\u7B26\u300C${ch}\u300D\u4E0D\u662F\u5408\u6CD5\u6570\u5B57\u5B57\u7B26\uFF08\u4EC5\u652F\u6301 0-9 a-z\uFF09` };
    if (d >= fromBase) return { ok: false, error: `\u5B57\u7B26\u300C${ch}\u300D\u8D85\u51FA ${fromBase} \u8FDB\u5236\u8303\u56F4` };
    acc = acc * base + BigInt(d);
  }
  if (negative) acc = -acc;
  const magnitude = negative ? -acc : acc;
  return {
    ok: true,
    negative,
    decimal: acc.toString(10),
    binary: bigToBase(magnitude, 2),
    octal: bigToBase(magnitude, 8),
    hex: bigToBase(magnitude, 16).toUpperCase(),
    base36: bigToBase(magnitude, 36),
    bitLength: magnitude === 0n ? 1 : magnitude.toString(2).length
  };
}

// src/core/color.ts
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function hslToRgb({ h, s, l }) {
  const hn = (h % 360 + 360) % 360 / 360;
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  if (sn === 0) {
    const v = Math.round(ln * 255);
    return { r: v, g: v, b: v };
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const hue = (t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return {
    r: Math.round(hue(hn + 1 / 3) * 255),
    g: Math.round(hue(hn) * 255),
    b: Math.round(hue(hn - 1 / 3) * 255)
  };
}
function relLuminance({ r, g, b }) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function parseColor(input) {
  const raw = input.trim().toLowerCase();
  if (raw === "") return { ok: false, error: "\u8F93\u5165\u4E3A\u7A7A" };
  let rgb = null;
  const hexMatch = raw.match(/^#([0-9a-f]{3,8})$/);
  if (hexMatch) {
    const h = hexMatch[1];
    if (h.length === 3 || h.length === 4) {
      rgb = {
        r: parseInt(h[0] + h[0], 16),
        g: parseInt(h[1] + h[1], 16),
        b: parseInt(h[2] + h[2], 16)
      };
    } else if (h.length === 6 || h.length === 8) {
      rgb = {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16)
      };
    } else {
      return { ok: false, error: `HEX \u4F4D\u6570\u975E\u6CD5\uFF083/4/6/8 \u4F4D\uFF09\uFF1A#${h}` };
    }
  } else {
    const rgbMatch = raw.match(/^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})/);
    if (rgbMatch) {
      rgb = { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) };
    } else {
      const hslMatch = raw.match(/^hsla?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})%?\s*[,\s]\s*(\d{1,3})%?/);
      if (hslMatch) {
        const hsl = { h: Number(hslMatch[1]), s: Number(hslMatch[2]), l: Number(hslMatch[3]) };
        rgb = hslToRgb(hsl);
        return buildResult(rgb, hsl);
      }
    }
  }
  if (!rgb) return { ok: false, error: "\u65E0\u6CD5\u8BC6\u522B\u7684\u989C\u8272\u683C\u5F0F\uFF08\u652F\u6301 #rgb #rrggbb #rrggbbaa\u3001rgb()\u3001hsl()\uFF09" };
  if (rgb.r > 255 || rgb.g > 255 || rgb.b > 255) return { ok: false, error: "RGB \u5206\u91CF\u987B\u5728 0-255" };
  return buildResult(rgb, rgbToHsl(rgb));
}
function buildResult(rgb, hsl) {
  const hex = `#${[rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  const luminance = relLuminance(rgb);
  return {
    ok: true,
    hex,
    rgb,
    hsl,
    cssRgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    cssHsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    luminance,
    contrastText: luminance > 0.35 ? "#000000" : "#ffffff"
  };
}

// src/core/url.ts
function parseUrl(input) {
  const raw = input.trim();
  if (raw === "") return { ok: false, error: "\u8F93\u5165\u4E3A\u7A7A" };
  let u;
  try {
    u = new URL(raw);
  } catch {
    try {
      u = new URL(`https://${raw}`);
    } catch (e2) {
      return { ok: false, error: `\u65E0\u6CD5\u89E3\u6790\u4E3A URL\uFF1A${e2.message}` };
    }
  }
  const params = [];
  for (const name of new Set(u.searchParams.keys())) {
    params.push({ name, values: u.searchParams.getAll(name) });
  }
  return {
    ok: true,
    href: u.href,
    protocol: u.protocol,
    username: u.username,
    password: u.password ? "\uFF08\u5DF2\u8BBE\u7F6E\uFF0C\u6B64\u5904\u4E0D\u56DE\u663E\uFF09" : "",
    hostname: u.hostname,
    port: u.port,
    pathname: u.pathname,
    search: u.search,
    hash: u.hash,
    origin: u.origin,
    params,
    pathSegments: u.pathname.split("/").filter((s) => s.length > 0)
  };
}

// src/ui.tsx
import { useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function CopyBtn({ text, label = "\u590D\u5236" }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(ta);
      }
    }
    setDone(true);
    setTimeout(() => setDone(false), 1200);
  };
  return /* @__PURE__ */ jsx("button", { className: "dtb-mini", onClick: copy, title: "\u590D\u5236\u5230\u526A\u8D34\u677F", disabled: text === "", children: done ? "\u5DF2\u590D\u5236" : label });
}
function SendBtn({ text }) {
  if (!hasSendToChat() || text === "") return null;
  return /* @__PURE__ */ jsx("button", { className: "dtb-mini", onClick: () => sendToChat(text), title: "\u53D1\u9001\u5230\u5F53\u524D\u4F1A\u8BDD", children: "\u53D1\u5230\u4F1A\u8BDD" });
}
function Input(props) {
  return /* @__PURE__ */ jsx(
    "input",
    {
      className: `dtb-input${props.mono ? " dtb-mono" : ""}`,
      type: props.type ?? "text",
      value: props.value,
      placeholder: props.placeholder,
      onChange: (e) => props.onChange(e.target.value)
    }
  );
}
function Area(props) {
  return /* @__PURE__ */ jsx(
    "textarea",
    {
      className: "dtb-area dtb-mono",
      rows: props.rows ?? 6,
      value: props.value,
      placeholder: props.placeholder,
      spellCheck: false,
      onChange: (e) => props.onChange(e.target.value)
    }
  );
}
function Select(props) {
  return /* @__PURE__ */ jsx("select", { className: "dtb-select", value: props.value, onChange: (e) => props.onChange(e.target.value), children: props.options.map((o) => /* @__PURE__ */ jsx("option", { value: o.value, children: o.label }, o.value)) });
}
function Check(props) {
  return /* @__PURE__ */ jsxs("label", { className: "dtb-check", title: props.title, children: [
    /* @__PURE__ */ jsx("input", { type: "checkbox", checked: props.checked, onChange: (e) => props.onChange(e.target.checked) }),
    props.label
  ] });
}
function L({ label, children, actions }) {
  return /* @__PURE__ */ jsxs("div", { className: "dtb-lrow", children: [
    /* @__PURE__ */ jsxs("div", { className: "dtb-llabel", children: [
      label,
      actions ? /* @__PURE__ */ jsx("span", { className: "dtb-lactions", children: actions }) : null
    ] }),
    /* @__PURE__ */ jsx("div", { className: "dtb-lvalue", children })
  ] });
}
function Out({ text, mono = true, rows }) {
  return /* @__PURE__ */ jsx("pre", { className: `dtb-out${mono ? " dtb-mono" : ""}`, style: rows ? { maxHeight: rows * 22 } : void 0, children: text === "" ? /* @__PURE__ */ jsx("span", { className: "dtb-dim", children: "\uFF08\u7A7A\uFF09" }) : text });
}
function Note({ kind, children }) {
  return /* @__PURE__ */ jsx("div", { className: `dtb-note dtb-note-${kind}`, children });
}

// src/tools/JwtTool.tsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var prettyJson = (v) => JSON.stringify(v, null, 2);
function ClaimRow({ d, k }) {
  const c = d[k];
  if (!c) return null;
  const labels = { iat: "iat \u7B7E\u53D1\u65F6\u95F4", nbf: "nbf \u751F\u6548\u65F6\u95F4", exp: "exp \u8FC7\u671F\u65F6\u95F4" };
  return /* @__PURE__ */ jsxs2(L, { label: labels[k], children: [
    /* @__PURE__ */ jsx2("span", { children: c.isoUtc }),
    /* @__PURE__ */ jsxs2("span", { className: "dtb-dim", children: [
      "\uFF08UTC \xB7 epoch ",
      c.epoch,
      "\uFF09"
    ] })
  ] });
}
function JwtTool() {
  const [token, setToken] = useState2("");
  const [secret, setSecret] = useState2("");
  const [verify, setVerify] = useState2(null);
  const [verifying, setVerifying] = useState2(false);
  const decoded = useMemo(() => {
    if (token.trim() === "") return {};
    try {
      return { data: decodeJwt(token) };
    } catch (e) {
      return { error: e.message };
    }
  }, [token]);
  const d = decoded.data;
  const runVerify = async () => {
    setVerifying(true);
    try {
      setVerify(await verifyJwtHs(token, secret));
    } catch (e) {
      setVerify({ ok: false, detail: e.message });
    } finally {
      setVerifying(false);
    }
  };
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsx2(Area, { value: token, onChange: setToken, rows: 4, placeholder: "\u7C98\u8D34 JWT\uFF08header.payload.signature\uFF09\u2014\u2014\u53EA\u5728\u672C\u5730\u89E3\u7801\uFF0C\u4E0D\u4F1A\u8054\u7F51\u4E5F\u4E0D\u4F1A\u5B58\u50A8" }),
    decoded.error ? /* @__PURE__ */ jsx2(Note, { kind: "error", children: decoded.error }) : null,
    d ? /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "dtb-badges", children: [
        /* @__PURE__ */ jsx2("span", { className: `dtb-badge dtb-badge-${d.expiryState === "valid" ? "ok" : d.expiryState === "expired" ? "bad" : "dim"}`, children: d.expiryState === "valid" ? "\u2713 \u672A\u8FC7\u671F" : d.expiryState === "expired" ? "\u2717 \u5DF2\u8FC7\u671F" : "\xB7 \u65E0\u8FC7\u671F\u58F0\u660E" }),
        /* @__PURE__ */ jsx2("span", { className: "dtb-dim", children: d.expiryDetail }),
        /* @__PURE__ */ jsxs2("span", { className: "dtb-dim", children: [
          "alg: ",
          String(d.header.alg ?? "\u672A\u58F0\u660E")
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "dtb-cards2", children: [
        /* @__PURE__ */ jsxs2("div", { className: "dtb-card", children: [
          /* @__PURE__ */ jsxs2("div", { className: "dtb-cardhead", children: [
            /* @__PURE__ */ jsx2("b", { children: "Header" }),
            /* @__PURE__ */ jsx2(CopyBtn, { text: prettyJson(d.header) })
          ] }),
          /* @__PURE__ */ jsx2(Out, { text: prettyJson(d.header) })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "dtb-card", children: [
          /* @__PURE__ */ jsxs2("div", { className: "dtb-cardhead", children: [
            /* @__PURE__ */ jsx2("b", { children: "Payload" }),
            /* @__PURE__ */ jsx2(CopyBtn, { text: prettyJson(d.payload) })
          ] }),
          /* @__PURE__ */ jsx2(Out, { text: prettyJson(d.payload) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "dtb-section", children: [
        /* @__PURE__ */ jsx2("b", { children: "\u65F6\u95F4\u58F0\u660E" }),
        d.iat || d.nbf || d.exp ? /* @__PURE__ */ jsxs2(Fragment, { children: [
          /* @__PURE__ */ jsx2(ClaimRow, { d, k: "iat" }),
          /* @__PURE__ */ jsx2(ClaimRow, { d, k: "nbf" }),
          /* @__PURE__ */ jsx2(ClaimRow, { d, k: "exp" })
        ] }) : /* @__PURE__ */ jsx2("span", { className: "dtb-dim", children: "\u65E0 iat/nbf/exp \u58F0\u660E" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "dtb-verify", children: [
        /* @__PURE__ */ jsx2("b", { children: "HS256/384/512 \u9A8C\u7B7E" }),
        /* @__PURE__ */ jsxs2("div", { className: "dtb-row", children: [
          /* @__PURE__ */ jsx2(
            "input",
            {
              className: "dtb-input dtb-mono dtb-grow",
              type: "password",
              value: secret,
              placeholder: "\u5171\u4EAB\u5BC6\u94A5\uFF08secret\uFF09\u2014\u2014\u4EC5\u672C\u5730\u4F7F\u7528\uFF0C\u4E0D\u5B58\u50A8",
              onChange: (e) => setSecret(e.target.value)
            }
          ),
          /* @__PURE__ */ jsx2("button", { className: "dtb-btn", onClick: runVerify, disabled: verifying || token.trim() === "", children: verifying ? "\u9A8C\u7B7E\u4E2D\u2026" : "\u9A8C\u7B7E" })
        ] }),
        verify ? /* @__PURE__ */ jsx2(Note, { kind: verify.ok ? "ok" : "error", children: verify.detail }) : null,
        /* @__PURE__ */ jsx2(Note, { kind: "info", children: "\u4EC5\u652F\u6301 HMAC \u7CFB\u7B97\u6CD5\uFF08HS256/384/512\uFF09\uFF1BRS/ES \u7CFB\u9700\u516C\u94A5\uFF0C\u6682\u4E0D\u652F\u6301\u3002\u8FC7\u671F\u5224\u65AD\u57FA\u4E8E\u672C\u673A\u65F6\u949F\u3002" })
      ] })
    ] }) : null
  ] });
}

// src/tools/HashTool.tsx
import { useEffect, useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var ALGOS = ["md5", "sha1", "sha256", "sha384", "sha512"];
var MAX_INPUT = 1e5;
function HashTool() {
  const [text, setText] = useState3("");
  const [secret, setSecret] = useState3("");
  const [digests, setDigests] = useState3({});
  const [error, setError] = useState3(null);
  const [busy, setBusy] = useState3(false);
  const input = text.length > MAX_INPUT ? text.slice(0, MAX_INPUT) : text;
  const truncated = text.length > MAX_INPUT;
  useEffect(() => {
    let alive = true;
    if (input === "") {
      setDigests({});
      setError(null);
      return;
    }
    setBusy(true);
    const hmac = secret !== "";
    Promise.all(
      ALGOS.map(async (alg) => {
        if (hmac && alg === "md5") return [alg, "\uFF08HMAC \u4E0D\u652F\u6301 MD5\uFF09"];
        try {
          return [alg, await hashText(alg, input, hmac ? secret : void 0)];
        } catch (e) {
          return [alg, `\u9519\u8BEF\uFF1A${e.message}`];
        }
      })
    ).then((pairs2) => {
      if (!alive) return;
      const next = {};
      for (const [k, v] of pairs2) next[k] = v;
      setDigests(next);
      setError(null);
    }).catch((e) => {
      if (alive) setError(e.message);
    }).finally(() => {
      if (alive) setBusy(false);
    });
    return () => {
      alive = false;
    };
  }, [input, secret]);
  const algoLabel = {
    md5: "MD5",
    sha1: "SHA-1",
    sha256: "SHA-256",
    sha384: "SHA-384",
    sha512: "SHA-512"
  };
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsx3(Area, { value: text, onChange: setText, rows: 5, placeholder: "\u8F93\u5165\u8981\u8BA1\u7B97\u54C8\u5E0C\u7684\u6587\u672C\uFF08UTF-8\uFF09" }),
    truncated ? /* @__PURE__ */ jsxs3(Note, { kind: "warn", children: [
      "\u8F93\u5165\u8D85\u8FC7 ",
      MAX_INPUT,
      " \u5B57\u7B26\uFF0C\u4EC5\u8BA1\u7B97\u524D ",
      MAX_INPUT,
      " \u5B57\u7B26"
    ] }) : null,
    /* @__PURE__ */ jsx3("div", { className: "dtb-row dtb-mt8", children: /* @__PURE__ */ jsx3(
      "input",
      {
        className: "dtb-input dtb-mono dtb-grow",
        type: "password",
        value: secret,
        placeholder: "HMAC \u5BC6\u94A5\uFF08\u53EF\u9009\uFF0C\u586B\u5165\u540E\u4E0A\u65B9\u53D8\u4E3A\u5BF9\u5E94 HMAC \u503C\uFF09",
        onChange: (e) => setSecret(e.target.value)
      }
    ) }),
    error ? /* @__PURE__ */ jsx3(Note, { kind: "error", children: error }) : null,
    /* @__PURE__ */ jsx3("div", { className: "dtb-hashlist", children: ALGOS.map((alg) => /* @__PURE__ */ jsxs3("div", { className: "dtb-hashrow", children: [
      /* @__PURE__ */ jsxs3("span", { className: "dtb-hashalg", children: [
        secret ? "HMAC-" : "",
        algoLabel[alg]
      ] }),
      /* @__PURE__ */ jsx3("span", { className: "dtb-hashval dtb-mono", children: digests[alg] ?? (busy ? "\u8BA1\u7B97\u4E2D\u2026" : "\u2014") }),
      digests[alg] ? /* @__PURE__ */ jsx3(CopyBtn, { text: digests[alg] }) : null
    ] }, alg)) }),
    /* @__PURE__ */ jsx3(Note, { kind: "info", children: "MD5/SHA-1 \u4EC5\u7528\u4E8E\u517C\u5BB9\u65E7\u534F\u8BAE\uFF0C\u4E0D\u5177\u5907\u9632\u78B0\u649E\u5B89\u5168\u6027\u3002\u5168\u90E8\u672C\u5730\u8BA1\u7B97\u3002" })
  ] });
}

// src/tools/UuidTool.tsx
import { useEffect as useEffect2, useState as useState4 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function UuidTool() {
  const [version, setVersion] = useState4("v4");
  const [count, setCount] = useState4("5");
  const [list, setList] = useState4([]);
  const generate = () => {
    const n = Number(count) || 1;
    setList(generateUuids(n, version));
  };
  useEffect2(generate, []);
  const [parseInput, setParseInput] = useState4("");
  const parsed = parseInput.trim() === "" ? null : parseUuid(parseInput);
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { className: "dtb-row", children: [
      /* @__PURE__ */ jsx4(
        Select,
        {
          value: version,
          onChange: (v) => setVersion(v),
          options: [
            { value: "v4", label: "v4\uFF08\u5BC6\u7801\u5B66\u968F\u673A\uFF09" },
            { value: "v7", label: "v7\uFF08\u65F6\u95F4\u6709\u5E8F\uFF0C\u53EF\u6392\u5E8F\uFF09" }
          ]
        }
      ),
      /* @__PURE__ */ jsx4(Input, { value: count, onChange: setCount, placeholder: "\u6570\u91CF\uFF081-500\uFF09", type: "number" }),
      /* @__PURE__ */ jsx4("button", { className: "dtb-btn", onClick: generate, children: "\u751F\u6210" }),
      list.length > 0 ? /* @__PURE__ */ jsx4(CopyBtn, { text: list.join("\n"), label: "\u5168\u90E8\u590D\u5236" }) : null,
      list.length > 0 ? /* @__PURE__ */ jsx4(SendBtn, { text: list.join("\n") }) : null
    ] }),
    /* @__PURE__ */ jsx4(Out, { text: list.join("\n"), rows: 12 }),
    /* @__PURE__ */ jsx4(Note, { kind: "info", children: "v4 \u4F7F\u7528 crypto.getRandomValues\uFF08\u6216 randomUUID\uFF09\uFF1Bv7 \u542B 48bit \u6BEB\u79D2\u65F6\u95F4\u6233\uFF0C\u540C\u4E00\u6BEB\u79D2\u5185\u5355\u8C03\u9012\u589E\uFF0C\u9002\u5408\u505A\u6570\u636E\u5E93\u4E3B\u952E\u3002" }),
    /* @__PURE__ */ jsxs4("div", { className: "dtb-mt8", children: [
      /* @__PURE__ */ jsx4("b", { children: "\u89E3\u6790 UUID" }),
      /* @__PURE__ */ jsx4("div", { className: "dtb-row dtb-mt4", children: /* @__PURE__ */ jsx4(Input, { value: parseInput, onChange: setParseInput, placeholder: "\u7C98\u8D34 UUID\uFF08\u652F\u6301\u82B1\u62EC\u53F7\u5F62\u5F0F\uFF09", mono: true }) }),
      parsed && !parsed.ok ? /* @__PURE__ */ jsx4(Note, { kind: "error", children: parsed.error }) : null,
      parsed && parsed.ok ? /* @__PURE__ */ jsxs4(Note, { kind: "ok", children: [
        "\u5408\u6CD5 \xB7 \u7248\u672C ",
        parsed.version,
        " \xB7 \u53D8\u4F53 ",
        parsed.variant,
        parsed.canonical ? /* @__PURE__ */ jsxs4("span", { className: "dtb-dim", children: [
          " \xB7 \u6807\u51C6\u5F62 ",
          parsed.canonical
        ] }) : null
      ] }) : null
    ] })
  ] });
}

// src/tools/Base64Tool.tsx
import { useMemo as useMemo2, useState as useState5 } from "react";
import { Fragment as Fragment2, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function Base64Tool() {
  const [mode, setMode] = useState5("enc");
  const [text, setText] = useState5("");
  const enc = useMemo2(() => mode === "enc" && text !== "" ? utf8ToBase64(text) : "", [mode, text]);
  const encUrl = useMemo2(() => mode === "enc" && text !== "" ? utf8ToBase64(text, true) : "", [mode, text]);
  const dec = useMemo2(() => {
    if (mode !== "dec" || text.trim() === "") return null;
    try {
      return base64ToUtf8(text);
    } catch (e) {
      return { error: e.message };
    }
  }, [mode, text]);
  return /* @__PURE__ */ jsxs5("div", { children: [
    /* @__PURE__ */ jsxs5("div", { className: "dtb-tabs", children: [
      /* @__PURE__ */ jsx5("button", { className: `dtb-tab${mode === "enc" ? " dtb-tab-on" : ""}`, onClick: () => setMode("enc"), children: "\u7F16\u7801" }),
      /* @__PURE__ */ jsx5("button", { className: `dtb-tab${mode === "dec" ? " dtb-tab-on" : ""}`, onClick: () => setMode("dec"), children: "\u89E3\u7801" })
    ] }),
    /* @__PURE__ */ jsx5(
      Area,
      {
        value: text,
        onChange: setText,
        rows: 5,
        placeholder: mode === "enc" ? "\u8F93\u5165\u6587\u672C\uFF08UTF-8\uFF0C\u4E2D\u6587/emoji \u5B89\u5168\uFF09" : "\u7C98\u8D34 Base64\uFF08\u5BB9\u5FCD\u7A7A\u767D\u3001URL-safe \u5B57\u7B26\u3001\u7F3A\u5931\u586B\u5145\uFF09"
      }
    ),
    mode === "enc" ? text === "" ? null : /* @__PURE__ */ jsxs5(Fragment2, { children: [
      /* @__PURE__ */ jsxs5("div", { className: "dtb-cardhead", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u6807\u51C6 Base64" }),
        /* @__PURE__ */ jsx5(CopyBtn, { text: enc })
      ] }),
      /* @__PURE__ */ jsx5(Out, { text: enc }),
      /* @__PURE__ */ jsxs5("div", { className: "dtb-cardhead", children: [
        /* @__PURE__ */ jsx5("b", { children: "URL-safe\uFF08-_\uFF0C\u65E0\u586B\u5145\uFF09" }),
        /* @__PURE__ */ jsx5(CopyBtn, { text: encUrl })
      ] }),
      /* @__PURE__ */ jsx5(Out, { text: encUrl })
    ] }) : dec === null ? null : "error" in dec ? /* @__PURE__ */ jsx5(Note, { kind: "error", children: dec.error }) : /* @__PURE__ */ jsxs5(Fragment2, { children: [
      /* @__PURE__ */ jsxs5("div", { className: "dtb-cardhead", children: [
        /* @__PURE__ */ jsxs5("b", { children: [
          "\u89E3\u7801\u7ED3\u679C",
          dec.replacedChars > 0 ? /* @__PURE__ */ jsxs5("span", { className: "dtb-dim", children: [
            "\uFF08",
            dec.byteLength,
            " \u5B57\u8282\uFF09"
          ] }) : /* @__PURE__ */ jsxs5("span", { className: "dtb-dim", children: [
            "\uFF08",
            dec.byteLength,
            " \u5B57\u8282\uFF09"
          ] })
        ] }),
        /* @__PURE__ */ jsx5(CopyBtn, { text: dec.text })
      ] }),
      /* @__PURE__ */ jsx5(Out, { text: dec.text }),
      dec.replacedChars > 0 ? /* @__PURE__ */ jsxs5(Note, { kind: "warn", children: [
        "\u68C0\u6D4B\u5230 ",
        dec.replacedChars,
        " \u4E2A U+FFFD \u66FF\u6362\u7B26\uFF1A\u8F93\u5165\u5B57\u8282\u4E0D\u662F\u5408\u6CD5 UTF-8 \u6587\u672C\uFF08\u53EF\u80FD\u662F\u4E8C\u8FDB\u5236\u6570\u636E\uFF09\u3002"
      ] }) : null
    ] })
  ] });
}

// src/tools/UrlTool.tsx
import { useMemo as useMemo3, useState as useState6 } from "react";
import { Fragment as Fragment3, jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function UrlTool() {
  const [text, setText] = useState6("");
  const enc = useMemo3(() => text === "" ? "" : urlEncode(text), [text]);
  const dec = useMemo3(() => {
    if (text.trim() === "") return null;
    try {
      return urlDecode(text);
    } catch (e) {
      return { error: e.message };
    }
  }, [text]);
  const parts = useMemo3(() => {
    if (text.trim() === "") return null;
    return parseUrl(text);
  }, [text]);
  return /* @__PURE__ */ jsxs6("div", { children: [
    /* @__PURE__ */ jsx6(Area, { value: text, onChange: setText, rows: 4, placeholder: "\u8F93\u5165 URL \u6216\u4EFB\u610F\u6587\u672C\uFF1A\u4E0B\u65B9\u540C\u65F6\u7ED9\u51FA\u7F16\u7801\u3001\u89E3\u7801\u4E0E\u89E3\u6790\u7ED3\u679C" }),
    enc !== "" ? /* @__PURE__ */ jsxs6(Fragment3, { children: [
      /* @__PURE__ */ jsxs6("div", { className: "dtb-cardhead", children: [
        /* @__PURE__ */ jsx6("b", { children: "URL \u7F16\u7801\uFF08component \u8BED\u4E49\uFF09" }),
        /* @__PURE__ */ jsx6(CopyBtn, { text: enc })
      ] }),
      /* @__PURE__ */ jsx6(Out, { text: enc })
    ] }) : null,
    dec && !("error" in dec) ? /* @__PURE__ */ jsxs6(Fragment3, { children: [
      /* @__PURE__ */ jsxs6("div", { className: "dtb-cardhead", children: [
        /* @__PURE__ */ jsx6("b", { children: "URL \u89E3\u7801" }),
        /* @__PURE__ */ jsx6(CopyBtn, { text: dec.text })
      ] }),
      /* @__PURE__ */ jsx6(L, { label: "\u4E25\u683C\u89E3\u7801\uFF08RFC 3986\uFF0C+ \u4E3A\u5B57\u9762\u52A0\u53F7\uFF09", children: /* @__PURE__ */ jsx6("span", { className: "dtb-mono", children: dec.text }) }),
      /* @__PURE__ */ jsx6(L, { label: "\u8868\u5355\u8BED\u4E49\u89E3\u7801\uFF08+ \u5F53\u7A7A\u683C\uFF09", children: /* @__PURE__ */ jsx6("span", { className: "dtb-mono", children: dec.textForm }) }),
      dec.textForm !== dec.text ? /* @__PURE__ */ jsx6(Note, { kind: "info", children: "\u4E24\u79CD\u53E3\u5F84\u7ED3\u679C\u4E0D\u540C\uFF1A\u67E5\u8BE2\u4E32\u91CC\u7684 + \u901A\u5E38\u6309\u8868\u5355\u8BED\u4E49\u5904\u7406\u3002" }) : null
    ] }) : null,
    dec && "error" in dec ? /* @__PURE__ */ jsx6(Note, { kind: "error", children: dec.error }) : null,
    parts && !parts.ok ? /* @__PURE__ */ jsx6(Note, { kind: "error", children: parts.error }) : null,
    parts && parts.ok ? /* @__PURE__ */ jsxs6(Fragment3, { children: [
      /* @__PURE__ */ jsxs6("div", { className: "dtb-section", children: [
        /* @__PURE__ */ jsx6("b", { children: "URL \u7EC4\u4EF6" }),
        /* @__PURE__ */ jsx6(L, { label: "origin", children: /* @__PURE__ */ jsx6("span", { className: "dtb-mono", children: parts.origin }) }),
        /* @__PURE__ */ jsx6(L, { label: "protocol", children: /* @__PURE__ */ jsx6("span", { className: "dtb-mono", children: parts.protocol }) }),
        /* @__PURE__ */ jsx6(L, { label: "host:port", children: /* @__PURE__ */ jsxs6("span", { className: "dtb-mono", children: [
          parts.hostname,
          parts.port ? `:${parts.port}` : ""
        ] }) }),
        parts.username ? /* @__PURE__ */ jsx6(L, { label: "auth", children: /* @__PURE__ */ jsxs6("span", { className: "dtb-mono", children: [
          parts.username,
          " / ",
          parts.password
        ] }) }) : null,
        /* @__PURE__ */ jsxs6(L, { label: "path", children: [
          /* @__PURE__ */ jsx6("span", { className: "dtb-mono", children: parts.pathname }),
          parts.pathSegments && parts.pathSegments.length > 0 ? /* @__PURE__ */ jsxs6("span", { className: "dtb-dim", children: [
            "\uFF08",
            parts.pathSegments.length,
            " \u6BB5\uFF1A",
            parts.pathSegments.join(" / "),
            "\uFF09"
          ] }) : null
        ] }),
        /* @__PURE__ */ jsx6(L, { label: "search", children: /* @__PURE__ */ jsx6("span", { className: "dtb-mono", children: parts.search || "\uFF08\u65E0\uFF09" }) }),
        /* @__PURE__ */ jsx6(L, { label: "hash", children: /* @__PURE__ */ jsx6("span", { className: "dtb-mono", children: parts.hash || "\uFF08\u65E0\uFF09" }) })
      ] }),
      parts.params && parts.params.length > 0 ? /* @__PURE__ */ jsxs6("div", { className: "dtb-section", children: [
        /* @__PURE__ */ jsxs6("b", { children: [
          "\u67E5\u8BE2\u53C2\u6570\uFF08",
          parts.params.length,
          " \u4E2A\u540D\u5B57\uFF09"
        ] }),
        /* @__PURE__ */ jsxs6("table", { className: "dtb-table", children: [
          /* @__PURE__ */ jsx6("thead", { children: /* @__PURE__ */ jsxs6("tr", { children: [
            /* @__PURE__ */ jsx6("th", { children: "\u53C2\u6570" }),
            /* @__PURE__ */ jsx6("th", { children: "\u503C" })
          ] }) }),
          /* @__PURE__ */ jsx6("tbody", { children: parts.params.map((p) => /* @__PURE__ */ jsxs6("tr", { children: [
            /* @__PURE__ */ jsx6("td", { className: "dtb-mono", children: p.name }),
            /* @__PURE__ */ jsx6("td", { className: "dtb-mono", children: p.values.map((v, i) => /* @__PURE__ */ jsxs6("div", { children: [
              v === "" ? /* @__PURE__ */ jsx6("span", { className: "dtb-dim", children: "\uFF08\u7A7A\uFF09" }) : v,
              p.values.length > 1 ? /* @__PURE__ */ jsxs6("span", { className: "dtb-dim", children: [
                " #",
                i + 1
              ] }) : null
            ] }, i)) })
          ] }, p.name)) })
        ] }),
        /* @__PURE__ */ jsx6(Note, { kind: "info", children: "\u540C\u540D\u53C2\u6570\u5168\u90E8\u5217\u51FA\uFF08URLSearchParams.get \u53EA\u8FD4\u56DE\u7B2C\u4E00\u4E2A\u503C\uFF0C\u8FD9\u91CC\u7528 getAll \u907F\u514D\u4E22\u53C2\uFF09\u3002" })
      ] }) : null
    ] }) : null
  ] });
}

// src/tools/JsonTool.tsx
import { useMemo as useMemo4, useState as useState7 } from "react";
import { Fragment as Fragment4, jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function JsonTool() {
  const [text, setText] = useState7("");
  const [sortKeys, setSortKeys] = useState7(false);
  const [minify, setMinify] = useState7(false);
  const [indent, setIndent] = useState7("2");
  const result = useMemo4(
    () => text.trim() === "" ? null : formatJson(text, { sortKeys, minify, indent: Number(indent) || 2 }),
    [text, sortKeys, minify, indent]
  );
  return /* @__PURE__ */ jsxs7("div", { children: [
    /* @__PURE__ */ jsx7(Area, { value: text, onChange: setText, rows: 8, placeholder: "\u7C98\u8D34 JSON" }),
    /* @__PURE__ */ jsxs7("div", { className: "dtb-row dtb-mt8", children: [
      /* @__PURE__ */ jsx7(Check, { checked: sortKeys, onChange: setSortKeys, label: "\u6DF1\u5EA6\u952E\u6392\u5E8F" }),
      /* @__PURE__ */ jsx7(Check, { checked: minify, onChange: setMinify, label: "\u538B\u7F29\uFF08minify\uFF09" }),
      /* @__PURE__ */ jsx7("span", { className: "dtb-dim", children: "\u7F29\u8FDB" }),
      /* @__PURE__ */ jsxs7("select", { className: "dtb-select", value: indent, onChange: (e) => setIndent(e.target.value), disabled: minify, children: [
        /* @__PURE__ */ jsx7("option", { value: "2", children: "2 \u7A7A\u683C" }),
        /* @__PURE__ */ jsx7("option", { value: "4", children: "4 \u7A7A\u683C" })
      ] })
    ] }),
    result === null ? null : !result.ok ? /* @__PURE__ */ jsxs7(Note, { kind: "error", children: [
      result.error,
      result.errorLine !== void 0 ? /* @__PURE__ */ jsxs7("span", { className: "dtb-dim", children: [
        " \u2014\u2014 \u7B2C ",
        result.errorLine,
        " \u884C \u7B2C ",
        result.errorColumn ?? "?",
        " \u5217\u9644\u8FD1"
      ] }) : null
    ] }) : /* @__PURE__ */ jsxs7(Fragment4, { children: [
      /* @__PURE__ */ jsxs7("div", { className: "dtb-cardhead", children: [
        /* @__PURE__ */ jsxs7("b", { children: [
          "\u8F93\u51FA ",
          /* @__PURE__ */ jsxs7("span", { className: "dtb-dim", children: [
            "\uFF08",
            result.inputChars,
            " \u2192 ",
            result.outputChars,
            " \u5B57\u7B26\uFF09"
          ] })
        ] }),
        /* @__PURE__ */ jsxs7("span", { className: "dtb-lactions", children: [
          /* @__PURE__ */ jsx7(CopyBtn, { text: result.output }),
          /* @__PURE__ */ jsx7(SendBtn, { text: result.output })
        ] })
      ] }),
      /* @__PURE__ */ jsx7(Out, { text: result.output, rows: 18 })
    ] })
  ] });
}

// src/tools/YamlTool.tsx
import { useMemo as useMemo5, useState as useState8 } from "react";
import { Fragment as Fragment5, jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
function YamlTool() {
  const [dir, setDir] = useState8("y2j");
  const [text, setText] = useState8("");
  const result = useMemo5(() => {
    if (text.trim() === "") return null;
    return dir === "y2j" ? yamlToJson(text) : jsonToYaml(text);
  }, [dir, text]);
  return /* @__PURE__ */ jsxs8("div", { children: [
    /* @__PURE__ */ jsxs8("div", { className: "dtb-tabs", children: [
      /* @__PURE__ */ jsx8("button", { className: `dtb-tab${dir === "y2j" ? " dtb-tab-on" : ""}`, onClick: () => setDir("y2j"), children: "YAML \u2192 JSON" }),
      /* @__PURE__ */ jsx8("button", { className: `dtb-tab${dir === "j2y" ? " dtb-tab-on" : ""}`, onClick: () => setDir("j2y"), children: "JSON \u2192 YAML" })
    ] }),
    /* @__PURE__ */ jsx8(
      Area,
      {
        value: text,
        onChange: setText,
        rows: 9,
        placeholder: dir === "y2j" ? "\u7C98\u8D34 YAML" : "\u7C98\u8D34 JSON"
      }
    ),
    result === null ? null : !result.ok ? /* @__PURE__ */ jsx8(Note, { kind: "error", children: result.error }) : /* @__PURE__ */ jsxs8(Fragment5, { children: [
      /* @__PURE__ */ jsxs8("div", { className: "dtb-cardhead", children: [
        /* @__PURE__ */ jsx8("b", { children: "\u8F93\u51FA" }),
        /* @__PURE__ */ jsx8(CopyBtn, { text: result.output })
      ] }),
      /* @__PURE__ */ jsx8(Out, { text: result.output, rows: 18 })
    ] }),
    /* @__PURE__ */ jsx8(Note, { kind: "info", children: "\u8F6C\u6362\u5E93 js-yaml 4 \u9ED8\u8BA4 schema \u4E3A YAML 1.2 core\uFF1Ayes/no/on/off \u89C6\u4E3A\u5B57\u7B26\u4E32\u800C\u975E\u5E03\u5C14\uFF1B\u7A7A\u503C\u5199\u6CD5 null/~ \u5747\u53EF\u4E3A null\u3002" })
  ] });
}

// src/tools/RegexTool.tsx
import { useMemo as useMemo6, useState as useState9 } from "react";
import { Fragment as Fragment6, jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
var FLAGS = [
  { f: "g", label: "g \u5168\u5C40", title: "\u5168\u5C40\u5339\u914D\uFF08\u66FF\u6362\u65F6\u5168\u90E8\u66FF\u6362\uFF09" },
  { f: "i", label: "i \u5FFD\u7565\u5927\u5C0F\u5199", title: "\u5FFD\u7565\u5927\u5C0F\u5199" },
  { f: "m", label: "m \u591A\u884C", title: "^ $ \u5339\u914D\u6BCF\u884C\u8FB9\u754C" },
  { f: "s", label: "s dotAll", title: "\u8BA9 . \u5339\u914D\u6362\u884C\u7B26\uFF08\u9ED8\u8BA4\u4E0D\u5339\u914D\uFF09" },
  { f: "u", label: "u unicode", title: "Unicode \u6A21\u5F0F" },
  { f: "y", label: "y \u7C98\u6EDE", title: "sticky\uFF0C\u4ECE lastIndex \u8D77\u5339\u914D" }
];
function RegexTool() {
  const [pattern, setPattern] = useState9("");
  const [flags, setFlags] = useState9("g");
  const [text, setText] = useState9("");
  const [replacement, setReplacement] = useState9("");
  const toggleFlag = (f) => {
    setFlags((cur) => cur.includes(f) ? cur.replace(f, "") : cur + f);
  };
  const active = useMemo6(
    () => pattern === "" ? null : testRegex(pattern, flags, text),
    [pattern, flags, text]
  );
  const rep = useMemo6(
    () => active && active.ok ? previewReplace(pattern, flags, text, replacement) : null,
    [active, pattern, flags, text, replacement]
  );
  return /* @__PURE__ */ jsxs9("div", { children: [
    /* @__PURE__ */ jsxs9("div", { className: "dtb-row", children: [
      /* @__PURE__ */ jsx9("span", { className: "dtb-dim", children: "/" }),
      /* @__PURE__ */ jsx9(Input, { value: pattern, onChange: setPattern, placeholder: "\u6B63\u5219\u8868\u8FBE\u5F0F\uFF08\u65E0\u9700\u659C\u6760\u5305\u88F9\uFF09", mono: true }),
      /* @__PURE__ */ jsxs9("span", { className: "dtb-dim", children: [
        "/",
        flags
      ] })
    ] }),
    /* @__PURE__ */ jsx9("div", { className: "dtb-row dtb-mt4", children: FLAGS.map((f) => /* @__PURE__ */ jsx9(Check, { checked: flags.includes(f.f), onChange: () => toggleFlag(f.f), label: f.label, title: f.title }, f.f)) }),
    /* @__PURE__ */ jsx9("div", { className: "dtb-mt8", children: /* @__PURE__ */ jsx9(Area, { value: text, onChange: setText, rows: 6, placeholder: "\u6D4B\u8BD5\u6587\u672C" }) }),
    active && !active.ok ? /* @__PURE__ */ jsx9(Note, { kind: "error", children: active.error }) : null,
    active && active.ok ? /* @__PURE__ */ jsxs9(Fragment6, { children: [
      /* @__PURE__ */ jsxs9("div", { className: "dtb-badges", children: [
        /* @__PURE__ */ jsxs9("span", { className: "dtb-badge dtb-badge-ok", children: [
          "\u5339\u914D ",
          active.matches.length,
          " \u5904"
        ] }),
        active.truncated ? /* @__PURE__ */ jsx9("span", { className: "dtb-badge dtb-badge-warn", children: "\u5DF2\u8FBE\u4E0A\u9650 500\uFF0C\u7ED3\u679C\u622A\u65AD" }) : null
      ] }),
      /* @__PURE__ */ jsxs9("div", { className: "dtb-hl dtb-mono", children: [
        active.segments.map(
          (seg, i) => seg.isMatch ? /* @__PURE__ */ jsx9("mark", { className: `dtb-mark${seg.zeroLength ? " dtb-mark-zero" : ""}`, children: seg.text === "" ? "\u2300" : seg.text }, i) : /* @__PURE__ */ jsx9("span", { children: seg.text }, i)
        ),
        text === "" ? /* @__PURE__ */ jsx9("span", { className: "dtb-dim", children: "\uFF08\u8F93\u5165\u6D4B\u8BD5\u6587\u672C\u540E\u663E\u793A\u9AD8\u4EAE\uFF09" }) : null
      ] }),
      active.matches.length > 0 ? /* @__PURE__ */ jsxs9("table", { className: "dtb-table dtb-mt8", children: [
        /* @__PURE__ */ jsx9("thead", { children: /* @__PURE__ */ jsxs9("tr", { children: [
          /* @__PURE__ */ jsx9("th", { children: "#" }),
          /* @__PURE__ */ jsx9("th", { children: "\u4F4D\u7F6E" }),
          /* @__PURE__ */ jsx9("th", { children: "\u5339\u914D" }),
          /* @__PURE__ */ jsx9("th", { children: "\u6355\u83B7\u7EC4" })
        ] }) }),
        /* @__PURE__ */ jsx9("tbody", { children: active.matches.map((m, i) => /* @__PURE__ */ jsxs9("tr", { children: [
          /* @__PURE__ */ jsx9("td", { children: i + 1 }),
          /* @__PURE__ */ jsx9("td", { className: "dtb-mono", children: m.index }),
          /* @__PURE__ */ jsx9("td", { className: "dtb-mono", children: m.match === "" ? "\u2300\uFF08\u96F6\u957F\uFF09" : m.match }),
          /* @__PURE__ */ jsxs9("td", { className: "dtb-mono", children: [
            Object.keys(m.namedGroups).length > 0 ? /* @__PURE__ */ jsx9("div", { children: Object.entries(m.namedGroups).map(([k, v]) => /* @__PURE__ */ jsxs9("div", { children: [
              "<",
              k,
              ">: ",
              v === void 0 ? "\uFF08\u672A\u5339\u914D\uFF09" : v
            ] }, k)) }) : null,
            m.groups.map((g, gi) => /* @__PURE__ */ jsxs9("div", { children: [
              "$",
              gi + 1,
              ": ",
              g === null ? "\uFF08\u672A\u5339\u914D\uFF09" : g
            ] }, gi))
          ] })
        ] }, i)) })
      ] }) : null,
      /* @__PURE__ */ jsxs9("div", { className: "dtb-mt8", children: [
        /* @__PURE__ */ jsx9("div", { className: "dtb-row", children: /* @__PURE__ */ jsx9(Input, { value: replacement, onChange: setReplacement, placeholder: "\u66FF\u6362\u4E3A\uFF08\u652F\u6301 $1 $<name> $& \u7B49\uFF09", mono: true }) }),
        replacement !== "" && rep ? rep.ok ? /* @__PURE__ */ jsxs9(Fragment6, { children: [
          /* @__PURE__ */ jsx9("div", { className: "dtb-cardhead", children: /* @__PURE__ */ jsx9("b", { children: "\u66FF\u6362\u9884\u89C8" }) }),
          /* @__PURE__ */ jsx9("pre", { className: "dtb-out dtb-mono", children: rep.output === "" ? /* @__PURE__ */ jsx9("span", { className: "dtb-dim", children: "\uFF08\u7A7A\uFF09" }) : rep.output })
        ] }) : /* @__PURE__ */ jsx9(Note, { kind: "error", children: rep.error }) : null
      ] }),
      /* @__PURE__ */ jsx9(Note, { kind: "info", children: "JS \u65B9\u8A00\uFF1A`.` \u9ED8\u8BA4\u4E0D\u5339\u914D\u6362\u884C\uFF08\u8981 s \u6807\u5FD7\uFF09\uFF1B\u626B\u63CF\u5217\u8868\u59CB\u7EC8\u5C55\u793A\u5168\u90E8\u6F5C\u5728\u5339\u914D\uFF0C\u4F46\u300C\u66FF\u6362\u9884\u89C8\u300D\u4E25\u683C\u9075\u5FAA\u4F60\u52FE\u9009\u7684\u6807\u5FD7\uFF08\u65E0 g \u53EA\u66FF\u6362\u7B2C\u4E00\u5904\uFF09\u3002" })
    ] }) : null
  ] });
}

// src/tools/CaseTool.tsx
import { useMemo as useMemo7, useState as useState10 } from "react";
import { Fragment as Fragment7, jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
function CaseTool() {
  const [text, setText] = useState10("");
  const r = useMemo7(() => text.trim() === "" ? null : convertCase(text), [text]);
  const rows = r ? [
    ["camelCase", r.camel],
    ["PascalCase", r.pascal],
    ["snake_case", r.snake],
    ["CONSTANT_CASE", r.constant],
    ["kebab-case", r.kebab],
    ["Train-Case", r.train],
    ["dot.case", r.dot],
    ["Title Case", r.title],
    ["lower case", r.lower],
    ["UPPER CASE", r.upper]
  ] : [];
  return /* @__PURE__ */ jsxs10("div", { children: [
    /* @__PURE__ */ jsx10(Area, { value: text, onChange: setText, rows: 3, placeholder: "\u8F93\u5165\u4EFB\u610F\u547D\u540D\uFF1AcamelCase / snake_case / kebab-case / \u7A7A\u683C\u5206\u8BCD\u5747\u53EF" }),
    r ? /* @__PURE__ */ jsxs10(Fragment7, { children: [
      /* @__PURE__ */ jsxs10("p", { className: "dtb-dim", children: [
        "\u5207\u8BCD\u7ED3\u679C\uFF1A",
        r.words.length > 0 ? r.words.map((w, i) => i === 0 ? w : " \xB7 " + w) : "\uFF08\u65E0\uFF09"
      ] }),
      /* @__PURE__ */ jsx10("div", { className: "dtb-caselist", children: rows.map(([label, value]) => /* @__PURE__ */ jsxs10("div", { className: "dtb-caserow", children: [
        /* @__PURE__ */ jsx10("span", { className: "dtb-casealg", children: label }),
        /* @__PURE__ */ jsx10("span", { className: "dtb-mono dtb-caseval", children: value === "" ? /* @__PURE__ */ jsx10("span", { className: "dtb-dim", children: "\uFF08\u7A7A\uFF09" }) : value }),
        /* @__PURE__ */ jsx10(CopyBtn, { text: value })
      ] }, label)) })
    ] }) : null
  ] });
}

// src/tools/TimeTool.tsx
import { useEffect as useEffect3, useState as useState11 } from "react";
import { Fragment as Fragment8, jsx as jsx11, jsxs as jsxs11 } from "react/jsx-runtime";
function TimeTool() {
  const [now, setNow] = useState11(() => nowInfo());
  const [ts, setTs] = useState11("");
  const [unit, setUnit] = useState11("auto");
  const [dateVal, setDateVal] = useState11("");
  useEffect3(() => {
    const t = setInterval(() => setNow(nowInfo()), 1e3);
    return () => clearInterval(t);
  }, []);
  const info = ts.trim() === "" ? null : analyzeTimestamp(ts, unit);
  const pickedMs = dateVal === "" ? null : dateInputToEpochMs(dateVal);
  const pickedRel = pickedMs !== null ? relativeTime(pickedMs) : null;
  return /* @__PURE__ */ jsxs11("div", { children: [
    /* @__PURE__ */ jsxs11("div", { className: "dtb-section", children: [
      /* @__PURE__ */ jsx11("b", { children: "\u5F53\u524D\u65F6\u95F4\uFF08\u6BCF\u79D2\u5237\u65B0\uFF09" }),
      /* @__PURE__ */ jsxs11(L, { label: "Unix \u79D2", children: [
        /* @__PURE__ */ jsx11("span", { className: "dtb-mono", children: now.seconds }),
        /* @__PURE__ */ jsx11(CopyBtn, { text: String(now.seconds) })
      ] }),
      /* @__PURE__ */ jsxs11(L, { label: "Unix \u6BEB\u79D2", children: [
        /* @__PURE__ */ jsx11("span", { className: "dtb-mono", children: now.millis }),
        /* @__PURE__ */ jsx11(CopyBtn, { text: String(now.millis) })
      ] }),
      /* @__PURE__ */ jsxs11(L, { label: "ISO UTC", children: [
        /* @__PURE__ */ jsx11("span", { className: "dtb-mono", children: now.isoUtc }),
        /* @__PURE__ */ jsx11(CopyBtn, { text: now.isoUtc })
      ] }),
      /* @__PURE__ */ jsxs11(L, { label: "\u672C\u5730", children: [
        /* @__PURE__ */ jsx11("span", { className: "dtb-mono", children: now.localReadable }),
        /* @__PURE__ */ jsx11(CopyBtn, { text: now.localReadable })
      ] })
    ] }),
    /* @__PURE__ */ jsxs11("div", { className: "dtb-section", children: [
      /* @__PURE__ */ jsx11("b", { children: "\u65F6\u95F4\u6233 \u2192 \u65E5\u671F" }),
      /* @__PURE__ */ jsxs11("div", { className: "dtb-row dtb-mt4", children: [
        /* @__PURE__ */ jsx11(Input, { value: ts, onChange: setTs, placeholder: "\u7C98\u8D34\u65F6\u95F4\u6233\uFF08\u81EA\u52A8\u8BC6\u522B\u79D2/\u6BEB\u79D2/\u5FAE\u79D2/\u7EB3\u79D2\uFF09", mono: true }),
        /* @__PURE__ */ jsx11(
          Select,
          {
            value: unit,
            onChange: (v) => setUnit(v),
            options: [
              { value: "auto", label: "\u81EA\u52A8\u8BC6\u522B" },
              { value: "s", label: "\u6309\u79D2" },
              { value: "ms", label: "\u6309\u6BEB\u79D2" }
            ]
          }
        )
      ] }),
      info && !info.ok ? /* @__PURE__ */ jsx11(Note, { kind: "error", children: info.error }) : null,
      info && info.ok ? /* @__PURE__ */ jsxs11(Fragment8, { children: [
        /* @__PURE__ */ jsx11(L, { label: "\u5224\u5B9A\u5355\u4F4D", children: /* @__PURE__ */ jsx11("span", { className: "dtb-mono", children: info.unit }) }),
        /* @__PURE__ */ jsxs11(L, { label: "epoch \u6BEB\u79D2", children: [
          /* @__PURE__ */ jsx11("span", { className: "dtb-mono", children: info.epochMs }),
          /* @__PURE__ */ jsx11(CopyBtn, { text: String(info.epochMs) })
        ] }),
        /* @__PURE__ */ jsxs11(L, { label: "ISO UTC", children: [
          /* @__PURE__ */ jsx11("span", { className: "dtb-mono", children: info.isoUtc }),
          /* @__PURE__ */ jsx11(CopyBtn, { text: info.isoUtc ?? "" })
        ] }),
        /* @__PURE__ */ jsxs11(L, { label: "\u672C\u5730\u65F6\u95F4", children: [
          /* @__PURE__ */ jsx11("span", { className: "dtb-mono", children: info.localReadable }),
          /* @__PURE__ */ jsx11(CopyBtn, { text: info.localReadable ?? "" })
        ] }),
        /* @__PURE__ */ jsx11(L, { label: "\u76F8\u5BF9", children: /* @__PURE__ */ jsx11("span", { children: info.relative }) })
      ] }) : null
    ] }),
    /* @__PURE__ */ jsxs11("div", { className: "dtb-section", children: [
      /* @__PURE__ */ jsx11("b", { children: "\u65E5\u671F \u2192 \u65F6\u95F4\u6233" }),
      /* @__PURE__ */ jsx11("div", { className: "dtb-row dtb-mt4", children: /* @__PURE__ */ jsx11(
        "input",
        {
          className: "dtb-input dtb-mono",
          type: "datetime-local",
          step: "0.001",
          value: dateVal,
          onChange: (e) => setDateVal(e.target.value)
        }
      ) }),
      pickedMs !== null ? /* @__PURE__ */ jsxs11(Fragment8, { children: [
        /* @__PURE__ */ jsxs11(L, { label: "Unix \u79D2", children: [
          /* @__PURE__ */ jsx11("span", { className: "dtb-mono", children: Math.floor(pickedMs / 1e3) }),
          /* @__PURE__ */ jsx11(CopyBtn, { text: String(Math.floor(pickedMs / 1e3)) })
        ] }),
        /* @__PURE__ */ jsxs11(L, { label: "Unix \u6BEB\u79D2", children: [
          /* @__PURE__ */ jsx11("span", { className: "dtb-mono", children: pickedMs }),
          /* @__PURE__ */ jsx11(CopyBtn, { text: String(pickedMs) })
        ] }),
        /* @__PURE__ */ jsxs11(L, { label: "ISO UTC", children: [
          /* @__PURE__ */ jsx11("span", { className: "dtb-mono", children: new Date(pickedMs).toISOString() }),
          /* @__PURE__ */ jsx11(CopyBtn, { text: new Date(pickedMs).toISOString() })
        ] }),
        /* @__PURE__ */ jsx11(L, { label: "\u76F8\u5BF9", children: /* @__PURE__ */ jsx11("span", { children: pickedRel }) })
      ] }) : null
    ] }),
    /* @__PURE__ */ jsx11(Out, { text: "" })
  ] });
}

// src/tools/CronTool.tsx
import { useMemo as useMemo8, useState as useState12 } from "react";
import { Fragment as Fragment9, jsx as jsx12, jsxs as jsxs12 } from "react/jsx-runtime";
var PRESETS = [
  ["* * * * *", "\u6BCF\u5206\u949F"],
  ["*/5 * * * *", "\u6BCF 5 \u5206\u949F"],
  ["0 * * * *", "\u6BCF\u5C0F\u65F6\u6574\u70B9"],
  ["30 8 * * *", "\u6BCF\u5929 08:30"],
  ["30 8 * * 1-5", "\u5DE5\u4F5C\u65E5 08:30"],
  ["0 0 1 * *", "\u6BCF\u6708 1 \u53F7\u96F6\u70B9"],
  ["0 9 * * 1,3,5", "\u4E00\u4E09\u4E94 09:00"]
];
function CronTool() {
  const [expr, setExpr] = useState12("");
  const info = useMemo8(() => expr.trim() === "" ? null : analyzeCron(expr, 5), [expr]);
  return /* @__PURE__ */ jsxs12("div", { children: [
    /* @__PURE__ */ jsx12(Input, { value: expr, onChange: setExpr, placeholder: "Cron \u8868\u8FBE\u5F0F\uFF085 \u6BB5 \u5206 \u65F6 \u65E5 \u6708 \u5468\uFF0C\u6216 6 \u6BB5\u542B\u79D2\uFF09", mono: true }),
    /* @__PURE__ */ jsx12("div", { className: "dtb-row dtb-wrap dtb-mt4", children: PRESETS.map(([e, label]) => /* @__PURE__ */ jsx12("button", { className: "dtb-mini", onClick: () => setExpr(e), title: e, children: label }, e)) }),
    info && !info.ok ? /* @__PURE__ */ jsx12(Note, { kind: "error", children: info.error }) : null,
    info && info.ok ? /* @__PURE__ */ jsxs12(Fragment9, { children: [
      info.description ? /* @__PURE__ */ jsxs12(Note, { kind: "ok", children: [
        info.description,
        /* @__PURE__ */ jsx12("span", { className: "dtb-lactions", children: /* @__PURE__ */ jsx12(SendBtn, { text: `Cron \`${expr}\`\uFF08${info.description}\uFF09
\u672A\u6765\u6267\u884C\uFF1A
${(info.next ?? []).join("\n")}` }) })
      ] }) : null,
      /* @__PURE__ */ jsxs12("div", { className: "dtb-section", children: [
        /* @__PURE__ */ jsx12("b", { children: "\u672A\u6765 5 \u6B21\u6267\u884C\uFF08\u672C\u5730\u65F6\u533A\uFF09" }),
        /* @__PURE__ */ jsx12("div", { className: "dtb-nextlist", children: (info.next ?? []).map((t) => /* @__PURE__ */ jsxs12("div", { className: "dtb-nextrow dtb-mono", children: [
          t,
          /* @__PURE__ */ jsx12(CopyBtn, { text: t })
        ] }, t)) })
      ] }),
      /* @__PURE__ */ jsxs12("div", { className: "dtb-section", children: [
        /* @__PURE__ */ jsx12("b", { children: "\u5B57\u6BB5" }),
        /* @__PURE__ */ jsx12("table", { className: "dtb-table", children: /* @__PURE__ */ jsxs12("tbody", { children: [
          info.hasSeconds ? /* @__PURE__ */ jsxs12("tr", { children: [
            /* @__PURE__ */ jsx12("td", { children: "\u79D2" }),
            /* @__PURE__ */ jsx12("td", { className: "dtb-mono", children: info.fields?.second })
          ] }) : null,
          /* @__PURE__ */ jsxs12("tr", { children: [
            /* @__PURE__ */ jsx12("td", { children: "\u5206" }),
            /* @__PURE__ */ jsx12("td", { className: "dtb-mono", children: info.fields?.minute })
          ] }),
          /* @__PURE__ */ jsxs12("tr", { children: [
            /* @__PURE__ */ jsx12("td", { children: "\u65F6" }),
            /* @__PURE__ */ jsx12("td", { className: "dtb-mono", children: info.fields?.hour })
          ] }),
          /* @__PURE__ */ jsxs12("tr", { children: [
            /* @__PURE__ */ jsx12("td", { children: "\u65E5\uFF08\u6708\u5185\uFF09" }),
            /* @__PURE__ */ jsx12("td", { className: "dtb-mono", children: info.fields?.dayOfMonth })
          ] }),
          /* @__PURE__ */ jsxs12("tr", { children: [
            /* @__PURE__ */ jsx12("td", { children: "\u6708" }),
            /* @__PURE__ */ jsx12("td", { className: "dtb-mono", children: info.fields?.month })
          ] }),
          /* @__PURE__ */ jsxs12("tr", { children: [
            /* @__PURE__ */ jsx12("td", { children: "\u5468" }),
            /* @__PURE__ */ jsx12("td", { className: "dtb-mono", children: info.fields?.dayOfWeek })
          ] })
        ] }) })
      ] })
    ] }) : null
  ] });
}

// src/tools/RadixTool.tsx
import { useMemo as useMemo9, useState as useState13 } from "react";
import { Fragment as Fragment10, jsx as jsx13, jsxs as jsxs13 } from "react/jsx-runtime";
function RadixTool() {
  const [text, setText] = useState13("");
  const [from, setFrom] = useState13("10");
  const r = useMemo9(() => text.trim() === "" ? null : convertRadix(text, Number(from) || 10), [text, from]);
  const rows = r && r.ok ? [
    ["\u4E8C\u8FDB\u5236 (2)", r.binary ?? ""],
    ["\u516B\u8FDB\u5236 (8)", r.octal ?? ""],
    ["\u5341\u8FDB\u5236 (10)", r.decimal ?? ""],
    ["\u5341\u516D\u8FDB\u5236 (16)", r.hex ?? ""],
    ["Base36", r.base36 ?? ""]
  ] : [];
  return /* @__PURE__ */ jsxs13("div", { children: [
    /* @__PURE__ */ jsxs13("div", { className: "dtb-row", children: [
      /* @__PURE__ */ jsx13("span", { className: "dtb-dim", children: "\u6E90\u8FDB\u5236" }),
      /* @__PURE__ */ jsx13(
        Select,
        {
          value: from,
          onChange: setFrom,
          options: [2, 8, 10, 16, 36].map((b) => ({ value: String(b), label: `${b} \u8FDB\u5236` }))
        }
      ),
      /* @__PURE__ */ jsx13(Input, { value: text, onChange: setText, placeholder: `\u8F93\u5165 ${from} \u8FDB\u5236\u6570\u503C\uFF08\u652F\u6301\u8D1F\u53F7\u4E0E\u4E0B\u5212\u7EBF\u5206\u9694\uFF09`, mono: true })
    ] }),
    r && !r.ok ? /* @__PURE__ */ jsx13(Note, { kind: "error", children: r.error }) : null,
    r && r.ok ? /* @__PURE__ */ jsxs13(Fragment10, { children: [
      /* @__PURE__ */ jsx13("div", { className: "dtb-caselist", children: rows.map(([label, value]) => /* @__PURE__ */ jsxs13("div", { className: "dtb-caserow", children: [
        /* @__PURE__ */ jsx13("span", { className: "dtb-casealg", children: label }),
        /* @__PURE__ */ jsx13("span", { className: "dtb-mono dtb-caseval", children: value }),
        /* @__PURE__ */ jsx13(CopyBtn, { text: value })
      ] }, label)) }),
      /* @__PURE__ */ jsxs13("p", { className: "dtb-dim", children: [
        "\u4F4D\u957F\uFF1A",
        r.bitLength,
        " bit",
        r.negative ? "\uFF08\u8D1F\u6570\uFF0C\u4F4D\u957F\u6309\u7EDD\u5BF9\u503C\u8BA1\uFF09" : "",
        "\uFF1B\u5168\u7A0B BigInt\uFF0C\u8D85\u8FC7 Number.MAX_SAFE_INTEGER \u4E5F\u7CBE\u786E\u3002"
      ] })
    ] }) : null
  ] });
}

// src/tools/ColorTool.tsx
import { useMemo as useMemo10, useState as useState14 } from "react";
import { Fragment as Fragment11, jsx as jsx14, jsxs as jsxs14 } from "react/jsx-runtime";
function ColorTool() {
  const [text, setText] = useState14("");
  const c = useMemo10(() => text.trim() === "" ? null : parseColor(text), [text]);
  return /* @__PURE__ */ jsxs14("div", { children: [
    /* @__PURE__ */ jsx14(Input, { value: text, onChange: setText, placeholder: "#0369a1 / rgb(3,105,161) / hsl(199,96%,32%)", mono: true }),
    c && !c.ok ? /* @__PURE__ */ jsx14(Note, { kind: "error", children: c.error }) : null,
    c && c.ok ? /* @__PURE__ */ jsxs14(Fragment11, { children: [
      /* @__PURE__ */ jsx14(
        "div",
        {
          className: "dtb-swatch",
          style: { background: c.cssRgb, color: c.contrastText },
          children: "Aa \u6E32\u67D3\u9884\u89C8"
        }
      ),
      /* @__PURE__ */ jsx14("div", { className: "dtb-caselist", children: [
        ["HEX", c.hex ?? ""],
        ["RGB", c.cssRgb ?? ""],
        ["HSL", c.cssHsl ?? ""]
      ].map(([label, value]) => /* @__PURE__ */ jsxs14("div", { className: "dtb-caserow", children: [
        /* @__PURE__ */ jsx14("span", { className: "dtb-casealg", children: label }),
        /* @__PURE__ */ jsx14("span", { className: "dtb-mono dtb-caseval", children: value }),
        /* @__PURE__ */ jsx14(CopyBtn, { text: value })
      ] }, label)) }),
      /* @__PURE__ */ jsxs14("p", { className: "dtb-dim", children: [
        "RGB ",
        c.rgb.r,
        ", ",
        c.rgb.g,
        ", ",
        c.rgb.b,
        " \xB7 HSL ",
        c.hsl.h,
        "\xB0, ",
        c.hsl.s,
        "%, ",
        c.hsl.l,
        "% \xB7 \u76F8\u5BF9\u4EAE\u5EA6",
        " ",
        c.luminance.toFixed(3),
        "\uFF08\u5BF9\u6BD4\u6587\u5B57\u8272 ",
        c.contrastText,
        "\uFF09"
      ] })
    ] }) : null,
    /* @__PURE__ */ jsx14(Note, { kind: "info", children: "\u652F\u6301 #rgb #rrggbb #rrggbbaa\u3001rgb()/rgba()\u3001hsl()/hsla()\uFF1BHSL \u5F80\u8FD4\u5141\u8BB8 \xB11 \u7684 8-bit \u91CF\u5316\u6F02\u79FB\u3002" })
  ] });
}

// src/tools.ts
var CATEGORIES = [
  { id: "token", label: "\u4EE4\u724C\u4E0E\u52A0\u5BC6" },
  { id: "codec", label: "\u7F16\u89E3\u7801" },
  { id: "format", label: "\u683C\u5F0F" },
  { id: "text", label: "\u6587\u672C" },
  { id: "time", label: "\u65F6\u95F4" },
  { id: "misc", label: "\u6570\u503C\u4E0E\u989C\u8272" }
];
var TOOLS = [
  {
    id: "jwt",
    name: "JWT \u89E3\u7801",
    icon: "\u{1F511}",
    category: "token",
    component: JwtTool,
    keywords: "jwt token \u9274\u6743 \u9A8C\u7B7E exp header payload hs256",
    desc: "\u89E3\u6790 JWT \u4E09\u6BB5\u7ED3\u6784\u3001\u8FC7\u671F\u72B6\u6001\uFF0C\u652F\u6301 HS256/384/512 \u9A8C\u7B7E"
  },
  {
    id: "hash",
    name: "\u54C8\u5E0C\u8BA1\u7B97",
    icon: "#\uFE0F\u20E3",
    category: "token",
    component: HashTool,
    keywords: "hash md5 sha1 sha256 sha512 hmac \u6458\u8981 digest",
    desc: "MD5 / SHA-1 / SHA-256 / 384 / 512 \u4E0E HMAC\uFF0C\u4E00\u6B21\u5168\u7B97"
  },
  {
    id: "uuid",
    name: "UUID \u751F\u6210",
    icon: "\u{1F194}",
    category: "token",
    component: UuidTool,
    keywords: "uuid guid v4 v7 \u968F\u673A \u552F\u4E00 id",
    desc: "\u5BC6\u7801\u5B66\u968F\u673A v4 \u4E0E\u5E26\u65F6\u95F4\u6233\u5355\u8C03 v7\uFF0C\u6279\u91CF\u751F\u6210\u4E0E\u89E3\u6790"
  },
  {
    id: "base64",
    name: "Base64 \u7F16\u89E3\u7801",
    icon: "\u{1F524}",
    category: "codec",
    component: Base64Tool,
    keywords: "base64 base64url \u7F16\u7801 \u89E3\u7801 b64 atob btoa",
    desc: "UTF-8 \u5B89\u5168\u7684 Base64 / Base64URL \u7F16\u89E3\u7801\uFF0C\u542B\u586B\u5145\u5BB9\u9519"
  },
  {
    id: "url",
    name: "URL \u7F16\u89E3\u7801\u4E0E\u89E3\u6790",
    icon: "\u{1F517}",
    category: "codec",
    component: UrlTool,
    keywords: "url uri encode decode query \u53C2\u6570 percent",
    desc: "URL \u7F16\u89E3\u7801\uFF08\u4E25\u683C/\u8868\u5355\u4E24\u79CD\u53E3\u5F84\uFF09\u4E0E\u7EC4\u4EF6\u3001\u53C2\u6570\u62C6\u89E3"
  },
  {
    id: "json",
    name: "JSON \u683C\u5F0F\u5316",
    icon: "\u{1F9FE}",
    category: "format",
    component: JsonTool,
    keywords: "json \u683C\u5F0F\u5316 \u6821\u9A8C \u538B\u7F29 \u6392\u5E8F \u7F8E\u5316 prettify",
    desc: "\u683C\u5F0F\u5316 / \u538B\u7F29 / \u6821\u9A8C\uFF08\u9519\u8BEF\u5B9A\u4F4D\u884C\u5217\uFF09/ \u6DF1\u5EA6\u952E\u6392\u5E8F"
  },
  {
    id: "yaml",
    name: "YAML \u4E0E JSON \u4E92\u8F6C",
    icon: "\u{1F504}",
    category: "format",
    component: YamlTool,
    keywords: "yaml json \u8F6C\u6362 yml \u914D\u7F6E",
    desc: "\u53CC\u5411\u8F6C\u6362\uFF0C\u660E\u793A YAML 1.2 core schema \u53E3\u5F84"
  },
  {
    id: "regex",
    name: "\u6B63\u5219\u6D4B\u8BD5",
    icon: "\u26F3",
    category: "text",
    component: RegexTool,
    keywords: "regex \u6B63\u5219 \u5339\u914D \u66FF\u6362 \u6355\u83B7\u7EC4 regexp",
    desc: "\u5B9E\u65F6\u5339\u914D\u9AD8\u4EAE\u3001\u6355\u83B7\u7EC4\u8868\u3001\u66FF\u6362\u9884\u89C8\uFF08JS \u65B9\u8A00\uFF09"
  },
  {
    id: "case",
    name: "\u547D\u540D\u98CE\u683C\u4E92\u8F6C",
    icon: "\u{1F520}",
    category: "text",
    component: CaseTool,
    keywords: "case camel pascal snake kebab \u547D\u540D \u53D8\u91CF",
    desc: "camelCase / snake_case / kebab-case \u7B49\u5341\u79CD\u98CE\u683C\u4E00\u952E\u4E92\u8F6C"
  },
  {
    id: "time",
    name: "\u65F6\u95F4\u6233\u8F6C\u6362",
    icon: "\u23F1\uFE0F",
    category: "time",
    component: TimeTool,
    keywords: "timestamp unix epoch \u65F6\u95F4\u6233 iso \u65F6\u533A \u65E5\u671F",
    desc: "Unix \u65F6\u95F4\u6233\u4E0E\u65E5\u671F\u4E92\u8F6C\uFF0C\u81EA\u52A8\u8BC6\u522B\u79D2/\u6BEB\u79D2/\u5FAE\u79D2"
  },
  {
    id: "cron",
    name: "Cron \u89E3\u6790",
    icon: "\u23F0",
    category: "time",
    component: CronTool,
    keywords: "cron \u5B9A\u65F6 \u8BA1\u5212\u4EFB\u52A1 crontab \u8C03\u5EA6",
    desc: "\u5B57\u6BB5\u62C6\u89E3\u3001\u4E2D\u6587\u63CF\u8FF0\u3001\u672A\u6765 5 \u6B21\u6267\u884C\u65F6\u95F4"
  },
  {
    id: "radix",
    name: "\u8FDB\u5236\u8F6C\u6362",
    icon: "\u{1F522}",
    category: "misc",
    component: RadixTool,
    keywords: "radix binary hex octal \u8FDB\u5236 \u4E8C\u8FDB\u5236 \u5341\u516D\u8FDB\u5236 big int",
    desc: "2-36 \u4EFB\u610F\u8FDB\u5236\u4E92\u8F6C\uFF0CBigInt \u652F\u6301\u8D85\u5927\u6574\u6570"
  },
  {
    id: "color",
    name: "\u989C\u8272\u8F6C\u6362",
    icon: "\u{1F3A8}",
    category: "misc",
    component: ColorTool,
    keywords: "color hex rgb hsl \u989C\u8272 \u8272\u503C css",
    desc: "HEX / RGB / HSL \u4E09\u5411\u4E92\u8F6C\u4E0E\u5BF9\u6BD4\u5EA6\u9884\u89C8"
  }
];
function searchTools(query) {
  const q = query.trim().toLowerCase();
  if (!q) return TOOLS;
  return TOOLS.filter(
    (t) => t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || t.keywords.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
  );
}
function findTool(id) {
  return TOOLS.find((t) => t.id === id);
}

// src/Panel.tsx
import { jsx as jsx15, jsxs as jsxs15 } from "react/jsx-runtime";
function DevToolboxPanel() {
  const [toolId, setToolId] = useState15(null);
  const [query, setQuery] = useState15("");
  const [favs, setFavs] = useState15([]);
  const [kvFailed, setKvFailed] = useState15(false);
  useEffect4(() => {
    let alive = true;
    Promise.all([kvGet(KV_FAVS), kvGet(KV_LAST)]).then(([f, l]) => {
      if (!alive) return;
      if (Array.isArray(f)) setFavs(f.filter((x) => typeof x === "string"));
      if (typeof l === "string" && findTool(l)) setToolId(l);
    }).catch(() => {
      if (alive) setKvFailed(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  const select = (id) => {
    setToolId(id);
    if (!kvFailed) kvSet(KV_LAST, id).catch(() => setKvFailed(true));
  };
  const toggleFav = (id) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(next);
    if (!kvFailed) kvSet(KV_FAVS, next).catch(() => setKvFailed(true));
  };
  const results = useMemo11(() => searchTools(query), [query]);
  const active = (toolId ? findTool(toolId) : null) ?? TOOLS[0];
  const favTools = favs.map(findTool).filter((t) => !!t);
  const searching = query.trim() !== "";
  const renderToolButton = (t) => /* @__PURE__ */ jsxs15(
    "button",
    {
      className: `dtb-toolbtn${t.id === active.id ? " dtb-toolbtn-on" : ""}`,
      onClick: () => select(t.id),
      title: t.desc,
      children: [
        /* @__PURE__ */ jsx15("span", { className: "dtb-toolicon", children: t.icon }),
        /* @__PURE__ */ jsx15("span", { className: "dtb-toolname", children: t.name }),
        /* @__PURE__ */ jsx15(
          "span",
          {
            className: `dtb-star${favs.includes(t.id) ? " dtb-star-on" : ""}`,
            title: favs.includes(t.id) ? "\u53D6\u6D88\u6536\u85CF" : "\u6536\u85CF",
            onClick: (e) => {
              e.stopPropagation();
              toggleFav(t.id);
            },
            children: favs.includes(t.id) ? "\u2605" : "\u2606"
          }
        )
      ]
    },
    t.id
  );
  const Active = active.component;
  return /* @__PURE__ */ jsxs15("div", { className: "dtb-root", children: [
    /* @__PURE__ */ jsxs15("aside", { className: "dtb-side", children: [
      /* @__PURE__ */ jsx15(
        "input",
        {
          className: "dtb-search",
          value: query,
          placeholder: "\u641C\u7D22\u5DE5\u5177\uFF08\u5982 jwt\u3001\u54C8\u5E0C\u3001cron\u2026\uFF09",
          onChange: (e) => setQuery(e.target.value)
        }
      ),
      /* @__PURE__ */ jsxs15("div", { className: "dtb-toollist", children: [
        !searching && favTools.length > 0 ? /* @__PURE__ */ jsxs15("div", { className: "dtb-cat", children: [
          /* @__PURE__ */ jsx15("div", { className: "dtb-catlabel", children: "\u2605 \u6536\u85CF" }),
          favTools.map(renderToolButton)
        ] }) : null,
        CATEGORIES.map((cat) => {
          const list = results.filter((t) => t.category === cat.id);
          if (list.length === 0) return null;
          return /* @__PURE__ */ jsxs15("div", { className: "dtb-cat", children: [
            /* @__PURE__ */ jsx15("div", { className: "dtb-catlabel", children: cat.label }),
            list.map(renderToolButton)
          ] }, cat.id);
        }),
        results.length === 0 ? /* @__PURE__ */ jsxs15("div", { className: "dtb-dim dtb-pad8", children: [
          "\u6CA1\u6709\u5339\u914D\u300C",
          query,
          "\u300D\u7684\u5DE5\u5177"
        ] }) : null
      ] }),
      /* @__PURE__ */ jsxs15("div", { className: "dtb-sidefoot", children: [
        TOOLS.length,
        " \u4E2A\u5DE5\u5177 \xB7 \u5168\u90E8\u672C\u5730\u8BA1\u7B97",
        kvFailed ? /* @__PURE__ */ jsx15("span", { className: "dtb-dim", children: "\uFF08\u72B6\u6001\u8BB0\u5FC6\u4E0D\u53EF\u7528\uFF09" }) : null
      ] })
    ] }),
    /* @__PURE__ */ jsxs15("main", { className: "dtb-main", children: [
      /* @__PURE__ */ jsxs15("header", { className: "dtb-head", children: [
        /* @__PURE__ */ jsx15("span", { className: "dtb-headicon", children: active.icon }),
        /* @__PURE__ */ jsxs15("div", { children: [
          /* @__PURE__ */ jsx15("h2", { className: "dtb-headtitle", children: active.name }),
          /* @__PURE__ */ jsx15("div", { className: "dtb-headdesc", children: active.desc })
        ] })
      ] }),
      /* @__PURE__ */ jsx15("div", { className: "dtb-body", children: /* @__PURE__ */ jsx15(Active, {}) }),
      /* @__PURE__ */ jsx15("footer", { className: "dtb-foot", children: "\u9690\u79C1\uFF1A\u6240\u6709\u8BA1\u7B97\u5728\u672C\u5730\u5B8C\u6210\uFF0C\u5DE5\u5177\u8F93\u5165\u4E0D\u5199\u5165\u4EFB\u4F55\u5B58\u50A8\uFF1B\u300C\u53D1\u5230\u4F1A\u8BDD\u300D\u4F1A\u628A\u663E\u5F0F\u9009\u62E9\u7684\u7ED3\u679C\u53D1\u9001\u5230\u5F53\u524D AI \u4F1A\u8BDD\u3002" })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx16 } from "react/jsx-runtime";
function DevToolboxPanelEntry() {
  return /* @__PURE__ */ jsx16(DevToolboxPanel, {});
}
export {
  DevToolboxPanelEntry as default
};
