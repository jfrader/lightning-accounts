/* eslint-disable */
/* tslint:disable */
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

/** @example {"id":2,"email":"fake@example.com","name":"fake name","role":"USER"} */
export interface User {
  id: number
  /** @format email */
  email: string
  name: string
  role: "USER" | "ADMIN"
}

/** @example {"id":2,"userId":1,"balanceInSats":8000,"disabled":false} */
export interface Wallet {
  id: number
  userId: number
  balanceInSats: number
  disabled: boolean
}

export type Me = User & {
  wallet?: Wallet
}

/** @example {"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1ZWJhYzUzNDk1NGI1NDEzOTgwNmMxMTIiLCJpYXQiOjE1ODkyOTg0ODQsImV4cCI6MTU4OTMwMDI4NH0.m1U63blB0MLej_WfB7yC2FTMnCziif9X8yzwDEfJXAg","expires":"2020-05-12T16:18:04.793Z"} */
export interface Token {
  token?: string
  /** @format date-time */
  expires?: string
}

export interface AuthTokens {
  access?: Token
  refresh?: Token
}

export interface Error {
  code?: number
  message?: string
}

export type QueryParamsType = Record<string | number, any>
export type ResponseFormat = keyof Omit<Body, "body" | "bodyUsed">

export interface FullRequestParams extends Omit<RequestInit, "body"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean
  /** request path */
  path: string
  /** content type of request body */
  type?: ContentType
  /** query params */
  query?: QueryParamsType
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseFormat
  /** request body */
  body?: unknown
  /** base url */
  baseUrl?: string
  /** request cancellation token */
  cancelToken?: CancelToken
}

export type RequestParams = Omit<FullRequestParams, "body" | "method" | "query" | "path">

export interface ApiConfig<SecurityDataType = unknown> {
  baseUrl?: string
  baseApiParams?: Omit<RequestParams, "baseUrl" | "cancelToken" | "signal">
  securityWorker?: (
    securityData: SecurityDataType | null
  ) => Promise<RequestParams | void> | RequestParams | void
  customFetch?: typeof fetch
}

export interface HttpResponse<D extends unknown, E extends unknown = unknown> extends Response {
  data: D
  error: E
}

type CancelToken = Symbol | string | number

export enum ContentType {
  Json = "application/json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export class HttpClient<SecurityDataType = unknown> {
  public baseUrl: string = "http://localhost:2999/v1"
  private securityData: SecurityDataType | null = null
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"]
  private abortControllers = new Map<CancelToken, AbortController>()
  private customFetch = (...fetchParams: Parameters<typeof fetch>) => fetch(...fetchParams)

  private baseApiParams: RequestParams = {
    credentials: "same-origin",
    headers: {},
    redirect: "follow",
    referrerPolicy: "no-referrer",
  }

  constructor(apiConfig: ApiConfig<SecurityDataType> = {}) {
    Object.assign(this, apiConfig)
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data
  }

  protected encodeQueryParam(key: string, value: any) {
    const encodedKey = encodeURIComponent(key)
    return `${encodedKey}=${encodeURIComponent(typeof value === "number" ? value : `${value}`)}`
  }

  protected addQueryParam(query: QueryParamsType, key: string) {
    return this.encodeQueryParam(key, query[key])
  }

  protected addArrayQueryParam(query: QueryParamsType, key: string) {
    const value = query[key]
    return value.map((v: any) => this.encodeQueryParam(key, v)).join("&")
  }

  protected toQueryString(rawQuery?: QueryParamsType): string {
    const query = rawQuery || {}
    const keys = Object.keys(query).filter((key) => "undefined" !== typeof query[key])
    return keys
      .map((key) =>
        Array.isArray(query[key])
          ? this.addArrayQueryParam(query, key)
          : this.addQueryParam(query, key)
      )
      .join("&")
  }

  protected addQueryParams(rawQuery?: QueryParamsType): string {
    const queryString = this.toQueryString(rawQuery)
    return queryString ? `?${queryString}` : ""
  }

  private contentFormatters: Record<ContentType, (input: any) => any> = {
    [ContentType.Json]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.Text]: (input: any) =>
      input !== null && typeof input !== "string" ? JSON.stringify(input) : input,
    [ContentType.FormData]: (input: any) =>
      Object.keys(input || {}).reduce((formData, key) => {
        const property = input[key]
        formData.append(
          key,
          property instanceof Blob
            ? property
            : typeof property === "object" && property !== null
            ? JSON.stringify(property)
            : `${property}`
        )
        return formData
      }, new FormData()),
    [ContentType.UrlEncoded]: (input: any) => this.toQueryString(input),
  }

  protected mergeRequestParams(params1: RequestParams, params2?: RequestParams): RequestParams {
    return {
      ...this.baseApiParams,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...(this.baseApiParams.headers || {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    }
  }

  protected createAbortSignal = (cancelToken: CancelToken): AbortSignal | undefined => {
    if (this.abortControllers.has(cancelToken)) {
      const abortController = this.abortControllers.get(cancelToken)
      if (abortController) {
        return abortController.signal
      }
      return void 0
    }

    const abortController = new AbortController()
    this.abortControllers.set(cancelToken, abortController)
    return abortController.signal
  }

  public abortRequest = (cancelToken: CancelToken) => {
    const abortController = this.abortControllers.get(cancelToken)

    if (abortController) {
      abortController.abort()
      this.abortControllers.delete(cancelToken)
    }
  }

  public request = async <T = any, E = any>({
    body,
    secure,
    path,
    type,
    query,
    format,
    baseUrl,
    cancelToken,
    ...params
  }: FullRequestParams): Promise<HttpResponse<T, E>> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.baseApiParams.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {}
    const requestParams = this.mergeRequestParams(params, secureParams)
    const queryString = query && this.toQueryString(query)
    const payloadFormatter = this.contentFormatters[type || ContentType.Json]
    const responseFormat = format || requestParams.format

    return this.customFetch(
      `${baseUrl || this.baseUrl || ""}${path}${queryString ? `?${queryString}` : ""}`,
      {
        ...requestParams,
        headers: {
          ...(requestParams.headers || {}),
          ...(type && type !== ContentType.FormData ? { "Content-Type": type } : {}),
        },
        signal: (cancelToken ? this.createAbortSignal(cancelToken) : requestParams.signal) || null,
        body: typeof body === "undefined" || body === null ? null : payloadFormatter(body),
      }
    ).then(async (response) => {
      const r = response as HttpResponse<T, E>
      r.data = null as unknown as T
      r.error = null as unknown as E

      const data = !responseFormat
        ? r
        : await response[responseFormat]()
            .then((data) => {
              if (r.ok) {
                r.data = data
              } else {
                r.error = data
              }
              return r
            })
            .catch((e) => {
              r.error = e
              return r
            })

      if (cancelToken) {
        this.abortControllers.delete(cancelToken)
      }

      if (!response.ok) throw data
      return data
    })
  }
}

/**
 * @title lightning-accounts API documentation
 * @version 1.0.0
 * @license MIT (https://github.com/antonio-lazaro/prisma-express-typescript-boilerplate.git)
 * @baseUrl http://localhost:2999/v1
 */
export class Api<SecurityDataType extends unknown> extends HttpClient<SecurityDataType> {
  auth = {
    /**
     * No description
     *
     * @tags Auth, User
     * @name GetAuth
     * @summary Get user's own profile
     * @request GET:/auth/me
     */
    getAuth: (params: RequestParams = {}) =>
      this.request<Me, Error>({
        path: `/auth/me`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name RegisterCreate
     * @summary Register as user
     * @request POST:/auth/register
     */
    registerCreate: (
      data: {
        name: string
        /**
         * must be unique
         * @format email
         */
        email: string
        /**
         * At least one number and one letter
         * @format password
         * @minLength 8
         */
        password: string
      },
      params: RequestParams = {}
    ) =>
      this.request<
        {
          user?: User
          tokens?: AuthTokens
        },
        Error
      >({
        path: `/auth/register`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name LoginCreate
     * @summary Login
     * @request POST:/auth/login
     */
    loginCreate: (
      data: {
        /** @format email */
        email: string
        /** @format password */
        password: string
      },
      params: RequestParams = {}
    ) =>
      this.request<
        {
          user?: User
          tokens?: AuthTokens
        },
        Error
      >({
        path: `/auth/login`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name LogoutCreate
     * @summary Logout
     * @request POST:/auth/logout
     */
    logoutCreate: (
      data: {
        refreshToken: string
      },
      params: RequestParams = {}
    ) =>
      this.request<void, Error>({
        path: `/auth/logout`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name RefreshTokensCreate
     * @summary Refresh auth tokens
     * @request POST:/auth/refresh-tokens
     */
    refreshTokensCreate: (
      data: {
        refreshToken: string
      },
      params: RequestParams = {}
    ) =>
      this.request<AuthTokens, Error>({
        path: `/auth/refresh-tokens`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description An email will be sent to reset password.
     *
     * @tags Auth
     * @name ForgotPasswordCreate
     * @summary Forgot password
     * @request POST:/auth/forgot-password
     */
    forgotPasswordCreate: (
      data: {
        /** @format email */
        email: string
      },
      params: RequestParams = {}
    ) =>
      this.request<void, Error>({
        path: `/auth/forgot-password`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name ResetPasswordCreate
     * @summary Reset password
     * @request POST:/auth/reset-password
     */
    resetPasswordCreate: (
      query: {
        /** The reset password token */
        token: string
      },
      data: {
        /**
         * At least one number and one letter
         * @format password
         * @minLength 8
         */
        password: string
      },
      params: RequestParams = {}
    ) =>
      this.request<void, Error>({
        path: `/auth/reset-password`,
        method: "POST",
        query: query,
        body: data,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * @description An email will be sent to verify email.
     *
     * @tags Auth
     * @name SendVerificationEmailCreate
     * @summary Send verification email
     * @request POST:/auth/send-verification-email
     * @secure
     */
    sendVerificationEmailCreate: (params: RequestParams = {}) =>
      this.request<void, Error>({
        path: `/auth/send-verification-email`,
        method: "POST",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name VerifyEmailCreate
     * @summary verify email
     * @request POST:/auth/verify-email
     */
    verifyEmailCreate: (
      query: {
        /** The verify email token */
        token: string
      },
      params: RequestParams = {}
    ) =>
      this.request<void, Error>({
        path: `/auth/verify-email`,
        method: "POST",
        query: query,
        ...params,
      }),
  }
  users = {
    /**
     * @description Only admins can create other users.
     *
     * @tags Users
     * @name UsersCreate
     * @summary Create a user
     * @request POST:/users
     * @secure
     */
    usersCreate: (
      data: {
        name: string
        /**
         * must be unique
         * @format email
         */
        email: string
        /**
         * At least one number and one letter
         * @format password
         * @minLength 8
         */
        password: string
        role: "user" | "admin"
      },
      params: RequestParams = {}
    ) =>
      this.request<User, Error>({
        path: `/users`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Only admins can retrieve all users.
     *
     * @tags Users
     * @name UsersList
     * @summary Get all users
     * @request GET:/users
     * @secure
     */
    usersList: (
      query?: {
        /** User name */
        name?: string
        /** User role */
        role?: string
        /** sort by query in the form of field:desc/asc (ex. name:asc) */
        sortBy?: string
        /**
         * Maximum number of users
         * @min 1
         * @default 10
         */
        limit?: number
        /**
         * Page number
         * @min 1
         * @default 1
         */
        page?: number
      },
      params: RequestParams = {}
    ) =>
      this.request<
        {
          results?: User[]
          /** @example 1 */
          page?: number
          /** @example 10 */
          limit?: number
          /** @example 1 */
          totalPages?: number
          /** @example 1 */
          totalResults?: number
        },
        Error
      >({
        path: `/users`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Logged in users can fetch only their own user information. Only admins can fetch other users.
     *
     * @tags Users
     * @name UsersDetail
     * @summary Get a user
     * @request GET:/users/{id}
     * @secure
     */
    usersDetail: (id: string, params: RequestParams = {}) =>
      this.request<User, Error>({
        path: `/users/${id}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Logged in users can only update their own information. Only admins can update other users.
     *
     * @tags Users
     * @name UsersPartialUpdate
     * @summary Update a user
     * @request PATCH:/users/{id}
     * @secure
     */
    usersPartialUpdate: (
      id: string,
      data: {
        name?: string
        /**
         * must be unique
         * @format email
         */
        email?: string
        /**
         * At least one number and one letter
         * @format password
         * @minLength 8
         */
        password?: string
      },
      params: RequestParams = {}
    ) =>
      this.request<User, Error>({
        path: `/users/${id}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Logged in users can delete only themselves. Only admins can delete other users.
     *
     * @tags Users
     * @name UsersDelete
     * @summary Delete a user
     * @request DELETE:/users/{id}
     * @secure
     */
    usersDelete: (id: string, params: RequestParams = {}) =>
      this.request<void, Error>({
        path: `/users/${id}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),
  }
}
