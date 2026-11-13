"use strict";
/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Api = exports.HttpClient = exports.ContentType = void 0;
var axios_1 = __importDefault(require("axios"));
var ContentType;
(function (ContentType) {
    ContentType["Json"] = "application/json";
    ContentType["JsonApi"] = "application/vnd.api+json";
    ContentType["FormData"] = "multipart/form-data";
    ContentType["UrlEncoded"] = "application/x-www-form-urlencoded";
    ContentType["Text"] = "text/plain";
})(ContentType || (exports.ContentType = ContentType = {}));
var HttpClient = /** @class */ (function () {
    function HttpClient(_a) {
        if (_a === void 0) { _a = {}; }
        var _this = this;
        var securityWorker = _a.securityWorker, secure = _a.secure, format = _a.format, axiosConfig = __rest(_a, ["securityWorker", "secure", "format"]);
        this.securityData = null;
        this.setSecurityData = function (data) {
            _this.securityData = data;
        };
        this.request = function (_a) { return __awaiter(_this, void 0, void 0, function () {
            var secureParams, _b, requestParams, responseFormat;
            var secure = _a.secure, path = _a.path, type = _a.type, query = _a.query, format = _a.format, body = _a.body, params = __rest(_a, ["secure", "path", "type", "query", "format", "body"]);
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _b = (typeof secure === "boolean" ? secure : this.secure) &&
                            this.securityWorker;
                        if (!_b) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.securityWorker(this.securityData)];
                    case 1:
                        _b = (_c.sent());
                        _c.label = 2;
                    case 2:
                        secureParams = (_b) ||
                            {};
                        requestParams = this.mergeRequestParams(params, secureParams);
                        responseFormat = format || this.format || undefined;
                        if (type === ContentType.FormData &&
                            body &&
                            body !== null &&
                            typeof body === "object") {
                            body = this.createFormData(body);
                        }
                        if (type === ContentType.Text &&
                            body &&
                            body !== null &&
                            typeof body !== "string") {
                            body = JSON.stringify(body);
                        }
                        return [2 /*return*/, this.instance.request(__assign(__assign({}, requestParams), { headers: __assign(__assign({}, (requestParams.headers || {})), (type ? { "Content-Type": type } : {})), params: query, responseType: responseFormat, data: body, url: path }))];
                }
            });
        }); };
        this.instance = axios_1.default.create(__assign(__assign({}, axiosConfig), { baseURL: axiosConfig.baseURL || "http://localhost:3000/v1" }));
        this.secure = secure;
        this.format = format;
        this.securityWorker = securityWorker;
    }
    HttpClient.prototype.mergeRequestParams = function (params1, params2) {
        var method = params1.method || (params2 && params2.method);
        return __assign(__assign(__assign(__assign({}, this.instance.defaults), params1), (params2 || {})), { headers: __assign(__assign(__assign({}, ((method &&
                this.instance.defaults.headers[method.toLowerCase()]) ||
                {})), (params1.headers || {})), ((params2 && params2.headers) || {})) });
    };
    HttpClient.prototype.stringifyFormItem = function (formItem) {
        if (typeof formItem === "object" && formItem !== null) {
            return JSON.stringify(formItem);
        }
        else {
            return "".concat(formItem);
        }
    };
    HttpClient.prototype.createFormData = function (input) {
        var _this = this;
        if (input instanceof FormData) {
            return input;
        }
        return Object.keys(input || {}).reduce(function (formData, key) {
            var e_1, _a;
            var property = input[key];
            var propertyContent = property instanceof Array ? property : [property];
            try {
                for (var propertyContent_1 = __values(propertyContent), propertyContent_1_1 = propertyContent_1.next(); !propertyContent_1_1.done; propertyContent_1_1 = propertyContent_1.next()) {
                    var formItem = propertyContent_1_1.value;
                    var isFileType = formItem instanceof Blob || formItem instanceof File;
                    formData.append(key, isFileType ? formItem : _this.stringifyFormItem(formItem));
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (propertyContent_1_1 && !propertyContent_1_1.done && (_a = propertyContent_1.return)) _a.call(propertyContent_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
            return formData;
        }, new FormData());
    };
    return HttpClient;
}());
exports.HttpClient = HttpClient;
/**
 * @title lightning-accounts API documentation
 * @version 7.1.0
 * @license MIT (https://github.com/jfrader/lightning-accounts.git)
 * @baseUrl http://localhost:3000/v1
 */
var Api = /** @class */ (function (_super) {
    __extends(Api, _super);
    function Api() {
        var _this = _super.apply(this, __spreadArray([], __read(arguments), false)) || this;
        _this.wallet = {
            /**
             * @description Create a lightning invoice to deposit sats to user's wallet.
             *
             * @tags Wallets
             * @name CreateDepositInvoice
             * @summary Create a deposit invoice
             * @request POST:/wallet/deposit
             */
            createDepositInvoice: function (data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/wallet/deposit", method: "POST", body: data, type: ContentType.Json, format: "json" }, params));
            },
            /**
             * @description Pay a lightning invoice with the user balance, using the whole balance if it is a zero-value invoice.
             *
             * @tags Wallets
             * @name PayWithdrawInvoice
             * @summary Pay a lightning invoice
             * @request POST:/wallet/withdraw
             */
            payWithdrawInvoice: function (data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/wallet/withdraw", method: "POST", body: data, type: ContentType.Json, format: "json" }, params));
            },
            /**
             * @description Pay sats to another user from your balance. Supply an idempotencyKey for safe retries; omitting it is unsafe and may pay twice. Keys are scoped to the payer and retained permanently. Replays return the original transaction; reuse with a different recipient, amount or description returns 409.
             *
             * @tags Wallets
             * @name PayUser
             * @summary Pay another user
             * @request POST:/wallet/pay
             */
            payUser: function (data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/wallet/pay", method: "POST", body: data, type: ContentType.Json, format: "json" }, params));
            },
            /**
             * @description Retrieve the status of a deposit transaction.
             *
             * @tags Wallets
             * @name GetDepositTransaction
             * @summary Get deposit transaction status
             * @request GET:/wallet/deposit/{transactionId}
             */
            getDepositTransaction: function (transactionId, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/wallet/deposit/".concat(transactionId), method: "GET", format: "json" }, params));
            },
            /**
             * @description Retrieve details of a payment request.
             *
             * @tags Wallets
             * @name GetPayRequest
             * @summary Get a payment request
             * @request GET:/wallet/pay-request/{payRequestId}
             */
            getPayRequest: function (payRequestId, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/wallet/pay-request/".concat(payRequestId), method: "GET", format: "json" }, params));
            },
            /**
             * @description Pay a payment request sent to the user.
             *
             * @tags Wallets
             * @name PayRequest
             * @summary Pay a payment request
             * @request POST:/wallet/pay-request/{payRequestId}/pay
             */
            payRequest: function (payRequestId, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/wallet/pay-request/".concat(payRequestId, "/pay"), method: "POST", format: "json" }, params));
            },
            /**
             * @description Create a payment request that another user can pay from their balance.
             *
             * @tags Wallets
             * @name CreatePayRequest
             * @summary Create a payment request
             * @request POST:/wallet/pay-request
             */
            createPayRequest: function (data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/wallet/pay-request", method: "POST", body: data, type: ContentType.Json, format: "json" }, params));
            },
            /**
             * @description Create multiple payment requests that other users can pay from their balance.
             *
             * @tags Wallets
             * @name CreatePayRequests
             * @summary Create multiple payment requests
             * @request POST:/wallet/pay-requests
             */
            createPayRequests: function (data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/wallet/pay-requests", method: "POST", body: data, type: ContentType.Json, format: "json" }, params));
            },
            /**
             * @description Retrieve details of multiple payment requests.
             *
             * @tags Wallets
             * @name GetPayRequests
             * @summary Get multiple payment requests
             * @request GET:/wallet/pay-requests
             */
            getPayRequests: function (data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/wallet/pay-requests", method: "GET", body: data, type: ContentType.Json, format: "json" }, params));
            },
            /**
             * @description Retrieve the hash and height of the latest Bitcoin block from the LND node using the `getLatestBitcoinBlock` method.
             *
             * @tags Wallets
             * @name GetLatestBitcoinBlock
             * @summary Get the latest Bitcoin block information
             * @request GET:/wallet/latest-bitcoin-block
             */
            getLatestBitcoinBlock: function (params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/wallet/latest-bitcoin-block", method: "GET", format: "json" }, params));
            },
        };
        _this.users = {
            /**
             * @description Only admins can create other users.
             *
             * @tags Users
             * @name CreateUser
             * @summary Create a new user
             * @request POST:/users
             */
            createUser: function (data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/users", method: "POST", body: data, type: ContentType.Json, format: "json" }, params));
            },
            /**
             * @description Only admins can retrieve all users.
             *
             * @tags Users
             * @name GetUsers
             * @summary Get all users
             * @request GET:/users
             */
            getUsers: function (query, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/users", method: "GET", query: query, format: "json" }, params));
            },
            /**
             * @description Logged-in users can fetch only their own user information. Only admins can fetch other users.
             *
             * @tags Users
             * @name GetUser
             * @summary Get a user
             * @request GET:/users/{id}
             */
            getUser: function (id, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/users/".concat(id), method: "GET", format: "json" }, params));
            },
            /**
             * @description Logged-in users can only update their own information. Only admins can update other users.
             *
             * @tags Users
             * @name UpdateUser
             * @summary Update a user
             * @request PATCH:/users/{id}
             */
            updateUser: function (id, data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/users/".concat(id), method: "PATCH", body: data, type: ContentType.Json, format: "json" }, params));
            },
            /**
             * @description Logged-in users can delete only themselves. Only admins can delete other users.
             *
             * @tags Users
             * @name DeleteUser
             * @summary Delete a user
             * @request DELETE:/users/{id}
             */
            deleteUser: function (id, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/users/".concat(id), method: "DELETE" }, params));
            },
            /**
             * @description Get user wallet (only yourself if not admin).
             *
             * @tags Users
             * @name GetUserWallet
             * @summary Get a user's wallet
             * @request GET:/users/{id}/wallet
             */
            getUserWallet: function (id, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/users/".concat(id, "/wallet"), method: "GET", format: "json" }, params));
            },
        };
        _this.auth = {
            /**
             * No description
             *
             * @tags Auth
             * @name GetUserProfile
             * @summary Get user's own profile
             * @request GET:/auth/me
             */
            getUserProfile: function (params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/me", method: "GET", format: "json" }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name RegisterUser
             * @summary Register a new user
             * @request POST:/auth/register
             */
            registerUser: function (data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/register", method: "POST", body: data, type: ContentType.Json, format: "json" }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name RegisterWithMagicLink
             * @summary Register with email magic link
             * @request POST:/auth/magic-link/register
             */
            registerWithMagicLink: function (data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/magic-link/register", method: "POST", body: data, type: ContentType.Json }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name SendMagicLoginLink
             * @summary Send an email magic login link, creating the account if needed
             * @request POST:/auth/magic-link/login
             */
            sendMagicLoginLink: function (data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/magic-link/login", method: "POST", body: data, type: ContentType.Json }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name ConsumeMagicLink
             * @summary Consume an email magic login link
             * @request POST:/auth/magic-link/consume
             */
            consumeMagicLink: function (query, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/magic-link/consume", method: "POST", query: query, format: "json" }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name LoginUser
             * @summary Log in a user
             * @request POST:/auth/login
             */
            loginUser: function (data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/login", method: "POST", body: data, type: ContentType.Json, format: "json" }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name LoginWithNostr
             * @summary Log in a user with a Nostr signed token
             * @request POST:/auth/login-nostr
             */
            loginWithNostr: function (data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/login-nostr", method: "POST", body: data, type: ContentType.Json, format: "json" }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name LogoutUser
             * @summary Log out a user
             * @request POST:/auth/logout
             */
            logoutUser: function (params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/logout", method: "POST" }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name RegisterWithSeed
             * @summary Register a new user with a seed phrase
             * @request POST:/auth/register-seed
             */
            registerWithSeed: function (data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/register-seed", method: "POST", body: data, type: ContentType.Json, format: "json" }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name LoginWithSeed
             * @summary Log in a user with a seed phrase
             * @request POST:/auth/login-seed
             */
            loginWithSeed: function (data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/login-seed", method: "POST", body: data, type: ContentType.Json, format: "json" }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name RefreshAuthTokens
             * @summary Refresh authentication tokens
             * @request POST:/auth/refresh-tokens
             */
            refreshAuthTokens: function (params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/refresh-tokens", method: "POST" }, params));
            },
            /**
             * @description An email will be sent to reset the password.
             *
             * @tags Auth
             * @name RequestPasswordReset
             * @summary Request a password reset
             * @request POST:/auth/forgot-password
             */
            requestPasswordReset: function (data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/forgot-password", method: "POST", body: data, type: ContentType.Json }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name ResetPassword
             * @summary Reset user password
             * @request POST:/auth/reset-password
             */
            resetPassword: function (query, data, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/reset-password", method: "POST", query: query, body: data, type: ContentType.Json }, params));
            },
            /**
             * @description An email will be sent to verify the user's email.
             *
             * @tags Auth
             * @name SendVerificationEmail
             * @summary Send email verification
             * @request POST:/auth/send-verification-email
             */
            sendVerificationEmail: function (params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/send-verification-email", method: "POST" }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name VerifyEmail
             * @summary Verify user email
             * @request POST:/auth/verify-email
             */
            verifyEmail: function (query, params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/verify-email", method: "POST", query: query }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name InitiateTwitterAuth
             * @summary Initiate Twitter authentication
             * @request GET:/auth/twitter
             */
            initiateTwitterAuth: function (params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/twitter", method: "GET", format: "json" }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name InitiateXAuth
             * @summary Initiate X authentication
             * @request GET:/auth/x
             */
            initiateXAuth: function (params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/x", method: "GET", format: "json" }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name HandleTwitterAuthCallback
             * @summary Handle Twitter authentication callback
             * @request GET:/auth/twitter/callback
             */
            handleTwitterAuthCallback: function (params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/twitter/callback", method: "GET", format: "json" }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name HandleXAuthCallback
             * @summary Handle X authentication callback
             * @request GET:/auth/x/callback
             */
            handleXAuthCallback: function (params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/x/callback", method: "GET", format: "json" }, params));
            },
            /**
             * No description
             *
             * @tags Auth
             * @name AddSeed
             * @summary Add a seed phrase to an existing user
             * @request POST:/auth/add-seed
             * @secure
             */
            addSeed: function (params) {
                if (params === void 0) { params = {}; }
                return _this.request(__assign({ path: "/auth/add-seed", method: "POST", secure: true, format: "json" }, params));
            },
        };
        return _this;
    }
    return Api;
}(HttpClient));
exports.Api = Api;
//# sourceMappingURL=index.js.map