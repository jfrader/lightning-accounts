export interface AuthTokens {
    access?: Token;
    refresh?: Token;
    identity?: Token;
}
export interface Error {
    code?: number;
    message?: string;
}
export interface Session {
    sid: string;
    sess?: number | string | boolean | object | any[] | null;
    /** @format date-time */
    expire: string;
    /** @format date-time */
    createdAt?: string;
    /** @format date-time */
    updatedAt: string;
}
export interface User {
    id?: number;
    /** @format date-time */
    createdAt?: string;
    /** @format date-time */
    updatedAt: string;
    email?: string | null;
    password?: string | null;
    twitterId?: string | null;
    twitter?: string | null;
    nostrPubkey?: string | null;
    seedHash?: string | null;
    /** @default false */
    hasSeed?: boolean;
    avatarUrl?: string | null;
    name: string;
    /** @default "USER" */
    role?: "USER" | "ADMIN" | "APPLICATION";
    /** @default false */
    isEmailVerified?: boolean;
    payRequestsCreated?: (PayRequest | null)[];
    payRequestsReceived?: (PayRequest | null)[];
    Token?: Token[];
    wallet?: Wallet | null;
    /** True when the user has configured password login */
    hasPassword?: boolean;
}
export interface Token {
    id?: number;
    /** @format date-time */
    createdAt?: string;
    /** @format date-time */
    updatedAt: string;
    token: string;
    type: "ACCESS" | "REFRESH" | "IDENTITY" | "RESET_PASSWORD" | "VERIFY_EMAIL" | "MAGIC_LINK" | "APPLICATION";
    /** @format date-time */
    expires: string;
    blacklisted: boolean;
    user?: User;
}
export interface Wallet {
    id?: number;
    /** @format date-time */
    createdAt?: string;
    /** @format date-time */
    updatedAt: string;
    balanceInSats: number;
    /** @default false */
    disabled?: boolean;
    /** @default false */
    busy?: boolean;
    transactions?: Transaction[];
    user?: User;
}
export interface PayRequest {
    id?: number;
    /** @format date-time */
    createdAt?: string;
    /** @format date-time */
    updatedAt: string;
    amountInSats: number;
    /** @default "" */
    description?: string;
    meta?: number | string | boolean | object | any[] | null;
    /** @default false */
    paid?: boolean;
    creator?: User;
    receiver?: User;
    transactions?: Transaction[];
}
export interface Transaction {
    id?: number;
    /** @format date-time */
    createdAt?: string;
    /** @format date-time */
    updatedAt: string;
    amountInSats: number;
    type: "SEND" | "RECEIVE" | "WITHDRAW" | "DEPOSIT";
    description?: string | null;
    /** @default false */
    walletImpacted?: boolean;
    invoiceSettled?: boolean | null;
    invoice?: number | string | boolean | object | any[] | null;
    idempotencyKey?: string | null;
    payoutReceiverId?: number | null;
    payRequest?: PayRequest | null;
    wallet?: Wallet | null;
}
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse, ResponseType } from "axios";
export type QueryParamsType = Record<string | number, any>;
export interface FullRequestParams extends Omit<AxiosRequestConfig, "data" | "params" | "url" | "responseType"> {
    /** set parameter to `true` for call `securityWorker` for this request */
    secure?: boolean;
    /** request path */
    path: string;
    /** content type of request body */
    type?: ContentType;
    /** query params */
    query?: QueryParamsType;
    /** format of response (i.e. response.json() -> format: "json") */
    format?: ResponseType;
    /** request body */
    body?: unknown;
}
export type RequestParams = Omit<FullRequestParams, "body" | "method" | "query" | "path">;
export interface ApiConfig<SecurityDataType = unknown> extends Omit<AxiosRequestConfig, "data" | "cancelToken"> {
    securityWorker?: (securityData: SecurityDataType | null) => Promise<AxiosRequestConfig | void> | AxiosRequestConfig | void;
    secure?: boolean;
    format?: ResponseType;
}
export declare enum ContentType {
    Json = "application/json",
    JsonApi = "application/vnd.api+json",
    FormData = "multipart/form-data",
    UrlEncoded = "application/x-www-form-urlencoded",
    Text = "text/plain"
}
export declare class HttpClient<SecurityDataType = unknown> {
    instance: AxiosInstance;
    private securityData;
    private securityWorker?;
    private secure?;
    private format?;
    constructor({ securityWorker, secure, format, ...axiosConfig }?: ApiConfig<SecurityDataType>);
    setSecurityData: (data: SecurityDataType | null) => void;
    protected mergeRequestParams(params1: AxiosRequestConfig, params2?: AxiosRequestConfig): AxiosRequestConfig;
    protected stringifyFormItem(formItem: unknown): string;
    protected createFormData(input: Record<string, unknown>): FormData;
    request: <T = any, _E = any>({ secure, path, type, query, format, body, ...params }: FullRequestParams) => Promise<AxiosResponse<T>>;
}
/**
 * @title lightning-accounts API documentation
 * @version 7.1.0
 * @license MIT (https://github.com/jfrader/lightning-accounts.git)
 * @baseUrl http://localhost:3000/v1
 */
export declare class Api<SecurityDataType extends unknown> extends HttpClient<SecurityDataType> {
    wallet: {
        /**
         * @description Create a lightning invoice to deposit sats to user's wallet.
         *
         * @tags Wallets
         * @name CreateDepositInvoice
         * @summary Create a deposit invoice
         * @request POST:/wallet/deposit
         */
        createDepositInvoice: (data: {
            amountInSats: number;
        }, params?: RequestParams) => Promise<AxiosResponse<Transaction, any, {}, any>>;
        /**
         * @description Pay a lightning invoice with the user balance, using the whole balance if it is a zero-value invoice.
         *
         * @tags Wallets
         * @name PayWithdrawInvoice
         * @summary Pay a lightning invoice
         * @request POST:/wallet/withdraw
         */
        payWithdrawInvoice: (data: {
            invoice: string;
        }, params?: RequestParams) => Promise<AxiosResponse<Transaction, any, {}, any>>;
        /**
         * @description Pay sats to another user from your balance. Supply an idempotencyKey for safe retries; omitting it is unsafe and may pay twice. Keys are scoped to the payer and retained permanently. Replays return the original transaction; reuse with a different recipient, amount or description returns 409.
         *
         * @tags Wallets
         * @name PayUser
         * @summary Pay another user
         * @request POST:/wallet/pay
         */
        payUser: (data: {
            /**
             * @minLength 1
             * @maxLength 200
             */
            idempotencyKey?: string;
            amountInSats: number;
            userId: number;
            description?: string;
        }, params?: RequestParams) => Promise<AxiosResponse<Transaction, any, {}, any>>;
        /**
         * @description Retrieve the status of a deposit transaction.
         *
         * @tags Wallets
         * @name GetDepositTransaction
         * @summary Get deposit transaction status
         * @request GET:/wallet/deposit/{transactionId}
         */
        getDepositTransaction: (transactionId: string, params?: RequestParams) => Promise<AxiosResponse<Transaction, any, {}, any>>;
        /**
         * @description Retrieve details of a payment request.
         *
         * @tags Wallets
         * @name GetPayRequest
         * @summary Get a payment request
         * @request GET:/wallet/pay-request/{payRequestId}
         */
        getPayRequest: (payRequestId: string, params?: RequestParams) => Promise<AxiosResponse<PayRequest, any, {}, any>>;
        /**
         * @description Pay a payment request sent to the user.
         *
         * @tags Wallets
         * @name PayRequest
         * @summary Pay a payment request
         * @request POST:/wallet/pay-request/{payRequestId}/pay
         */
        payRequest: (payRequestId: string, params?: RequestParams) => Promise<AxiosResponse<PayRequest, any, {}, any>>;
        /**
         * @description Create a payment request that another user can pay from their balance.
         *
         * @tags Wallets
         * @name CreatePayRequest
         * @summary Create a payment request
         * @request POST:/wallet/pay-request
         */
        createPayRequest: (data: {
            receiverId: number;
            amountInSats: number;
            meta?: object;
            description?: string;
        }, params?: RequestParams) => Promise<AxiosResponse<PayRequest, any, {}, any>>;
        /**
         * @description Create multiple payment requests that other users can pay from their balance.
         *
         * @tags Wallets
         * @name CreatePayRequests
         * @summary Create multiple payment requests
         * @request POST:/wallet/pay-requests
         */
        createPayRequests: (data: {
            receiverIds: number[];
            amountInSats: number;
            meta?: object;
            description?: string;
        }, params?: RequestParams) => Promise<AxiosResponse<PayRequest[], any, {}, any>>;
        /**
         * @description Retrieve details of multiple payment requests.
         *
         * @tags Wallets
         * @name GetPayRequests
         * @summary Get multiple payment requests
         * @request GET:/wallet/pay-requests
         */
        getPayRequests: (data: {
            payRequestIds: number[];
        }, params?: RequestParams) => Promise<AxiosResponse<PayRequest[], any, {}, any>>;
        /**
         * @description Retrieve the hash and height of the latest Bitcoin block from the LND node using the `getLatestBitcoinBlock` method.
         *
         * @tags Wallets
         * @name GetLatestBitcoinBlock
         * @summary Get the latest Bitcoin block information
         * @request GET:/wallet/latest-bitcoin-block
         */
        getLatestBitcoinBlock: (params?: RequestParams) => Promise<AxiosResponse<{
            /** The hash of the latest Bitcoin block */
            hash: string;
            /** The height of the latest Bitcoin block */
            height: number;
        }, any, {}, any>>;
    };
    users: {
        /**
         * @description Only admins can create other users.
         *
         * @tags Users
         * @name CreateUser
         * @summary Create a new user
         * @request POST:/users
         */
        createUser: (data: {
            name: string;
            /**
             * Must be unique
             * @format email
             */
            email: string;
            /**
             * At least one number and one letter
             * @format password
             * @minLength 8
             */
            password: string;
            role: "user" | "admin";
        }, params?: RequestParams) => Promise<AxiosResponse<User, any, {}, any>>;
        /**
         * @description Only admins can retrieve all users.
         *
         * @tags Users
         * @name GetUsers
         * @summary Get all users
         * @request GET:/users
         */
        getUsers: (query?: {
            /** User name */
            name?: string;
            /** User role */
            role?: string;
            /** Sort by query in the form of field:desc/asc (ex. name:asc) */
            sortBy?: string;
            /**
             * Maximum number of users
             * @min 1
             * @default 10
             */
            limit?: number;
            /**
             * Page number
             * @min 1
             * @default 1
             */
            page?: number;
        }, params?: RequestParams) => Promise<AxiosResponse<{
            results?: User[];
            /** @example 1 */
            page?: number;
            /** @example 10 */
            limit?: number;
            /** @example 1 */
            totalPages?: number;
            /** @example 1 */
            totalResults?: number;
        }, any, {}, any>>;
        /**
         * @description Logged-in users can fetch only their own user information. Only admins can fetch other users.
         *
         * @tags Users
         * @name GetUser
         * @summary Get a user
         * @request GET:/users/{id}
         */
        getUser: (id: string, params?: RequestParams) => Promise<AxiosResponse<User, any, {}, any>>;
        /**
         * @description Logged-in users can only update their own information. Only admins can update other users.
         *
         * @tags Users
         * @name UpdateUser
         * @summary Update a user
         * @request PATCH:/users/{id}
         */
        updateUser: (id: string, data: {
            name?: string;
            /**
             * Must be unique
             * @format email
             */
            email?: string;
            /** @format password */
            currentPassword?: string;
            /**
             * At least one number and one letter
             * @format password
             * @minLength 8
             */
            password?: string;
        }, params?: RequestParams) => Promise<AxiosResponse<User, any, {}, any>>;
        /**
         * @description Logged-in users can delete only themselves. Only admins can delete other users.
         *
         * @tags Users
         * @name DeleteUser
         * @summary Delete a user
         * @request DELETE:/users/{id}
         */
        deleteUser: (id: string, params?: RequestParams) => Promise<AxiosResponse<void, any, {}, any>>;
        /**
         * @description Get user wallet (only yourself if not admin).
         *
         * @tags Users
         * @name GetUserWallet
         * @summary Get a user's wallet
         * @request GET:/users/{id}/wallet
         */
        getUserWallet: (id: string, params?: RequestParams) => Promise<AxiosResponse<Wallet, any, {}, any>>;
    };
    auth: {
        /**
         * No description
         *
         * @tags Auth
         * @name GetUserProfile
         * @summary Get user's own profile
         * @request GET:/auth/me
         */
        getUserProfile: (params?: RequestParams) => Promise<AxiosResponse<User, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name RegisterUser
         * @summary Register a new user
         * @request POST:/auth/register
         */
        registerUser: (data: {
            name: string;
            /**
             * Must be unique
             * @format email
             */
            email: string;
            /**
             * At least one number and one letter
             * @format password
             * @minLength 8
             */
            password: string;
        }, params?: RequestParams) => Promise<AxiosResponse<{
            user?: User;
        }, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name RegisterWithMagicLink
         * @summary Register with email magic link
         * @request POST:/auth/magic-link/register
         */
        registerWithMagicLink: (data: {
            name: string;
            /** @format email */
            email: string;
        }, params?: RequestParams) => Promise<AxiosResponse<void, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name SendMagicLoginLink
         * @summary Send an email magic login link, creating the account if needed
         * @request POST:/auth/magic-link/login
         */
        sendMagicLoginLink: (data: {
            /** @format email */
            email: string;
            next?: "profile";
        }, params?: RequestParams) => Promise<AxiosResponse<void, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name ConsumeMagicLink
         * @summary Consume an email magic login link
         * @request POST:/auth/magic-link/consume
         */
        consumeMagicLink: (query: {
            token: string;
        }, params?: RequestParams) => Promise<AxiosResponse<{
            user?: User;
        }, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name LoginUser
         * @summary Log in a user
         * @request POST:/auth/login
         */
        loginUser: (data: {
            /** @format email */
            email: string;
            /** @format password */
            password: string;
        }, params?: RequestParams) => Promise<AxiosResponse<{
            user?: User;
        }, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name LoginWithNostr
         * @summary Log in a user with a Nostr signed token
         * @request POST:/auth/login-nostr
         */
        loginWithNostr: (data: {
            /** Base64 encoded NIP-98 token */
            token: string;
        }, params?: RequestParams) => Promise<AxiosResponse<{
            user?: User;
        }, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name LogoutUser
         * @summary Log out a user
         * @request POST:/auth/logout
         */
        logoutUser: (params?: RequestParams) => Promise<AxiosResponse<void, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name RegisterWithSeed
         * @summary Register a new user with a seed phrase
         * @request POST:/auth/register-seed
         */
        registerWithSeed: (data: {
            name: string;
        }, params?: RequestParams) => Promise<AxiosResponse<{
            user?: User;
            /** The generated seed phrase */
            seedPhrase?: string;
        }, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name LoginWithSeed
         * @summary Log in a user with a seed phrase
         * @request POST:/auth/login-seed
         */
        loginWithSeed: (data: {
            seedPhrase: string;
        }, params?: RequestParams) => Promise<AxiosResponse<{
            user?: User;
        }, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name RefreshAuthTokens
         * @summary Refresh authentication tokens
         * @request POST:/auth/refresh-tokens
         */
        refreshAuthTokens: (params?: RequestParams) => Promise<AxiosResponse<void, any, {}, any>>;
        /**
         * @description An email will be sent to reset the password.
         *
         * @tags Auth
         * @name RequestPasswordReset
         * @summary Request a password reset
         * @request POST:/auth/forgot-password
         */
        requestPasswordReset: (data: {
            /** @format email */
            email: string;
        }, params?: RequestParams) => Promise<AxiosResponse<void, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name ResetPassword
         * @summary Reset user password
         * @request POST:/auth/reset-password
         */
        resetPassword: (query: {
            /** The reset password token */
            token: string;
        }, data: {
            /**
             * At least one number and one letter
             * @format password
             * @minLength 8
             */
            password: string;
        }, params?: RequestParams) => Promise<AxiosResponse<void, any, {}, any>>;
        /**
         * @description An email will be sent to verify the user's email.
         *
         * @tags Auth
         * @name SendVerificationEmail
         * @summary Send email verification
         * @request POST:/auth/send-verification-email
         */
        sendVerificationEmail: (params?: RequestParams) => Promise<AxiosResponse<void, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name VerifyEmail
         * @summary Verify user email
         * @request POST:/auth/verify-email
         */
        verifyEmail: (query: {
            /** The verify email token */
            token: string;
        }, params?: RequestParams) => Promise<AxiosResponse<void, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name InitiateTwitterAuth
         * @summary Initiate Twitter authentication
         * @request GET:/auth/twitter
         */
        initiateTwitterAuth: (params?: RequestParams) => Promise<AxiosResponse<User, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name InitiateXAuth
         * @summary Initiate X authentication
         * @request GET:/auth/x
         */
        initiateXAuth: (params?: RequestParams) => Promise<AxiosResponse<User, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name HandleTwitterAuthCallback
         * @summary Handle Twitter authentication callback
         * @request GET:/auth/twitter/callback
         */
        handleTwitterAuthCallback: (params?: RequestParams) => Promise<AxiosResponse<User, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name HandleXAuthCallback
         * @summary Handle X authentication callback
         * @request GET:/auth/x/callback
         */
        handleXAuthCallback: (params?: RequestParams) => Promise<AxiosResponse<User, any, {}, any>>;
        /**
         * No description
         *
         * @tags Auth
         * @name AddSeed
         * @summary Add a seed phrase to an existing user
         * @request POST:/auth/add-seed
         * @secure
         */
        addSeed: (params?: RequestParams) => Promise<AxiosResponse<{
            user?: User;
            /** The generated seed phrase */
            seedPhrase?: string;
        }, any, {}, any>>;
    };
}
//# sourceMappingURL=index.d.ts.map