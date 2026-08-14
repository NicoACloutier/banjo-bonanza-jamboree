/**
 * Typed endpoint functions wrapping `apiRequest`. This is the only module
 * that should know the actual URL paths for the backend API.
 */
import { apiRequest } from "./apiClient";
import type {
  TabCreateRequest,
  TabDetail,
  TabListResponse,
  TabUpdateRequest,
  TokenResponse,
  TuningOut,
  UserPublic,
  VoteResponse,
} from "../types/api";

export const AuthApi = {
  register: (username: string, email: string, password: string) =>
    apiRequest<TokenResponse>("/api/auth/register", {
      method: "POST",
      body: { username, email, password },
      auth: false,
    }),
  login: (username: string, password: string) =>
    apiRequest<TokenResponse>("/api/auth/login", {
      method: "POST",
      body: { username, password },
      auth: false,
    }),
  google: (code: string) =>
    apiRequest<TokenResponse>("/api/auth/google", { method: "POST", body: { code }, auth: false }),
  me: () => apiRequest<UserPublic>("/api/auth/me"),
};

export const TabsApi = {
  tunings: () => apiRequest<TuningOut[]>("/api/tabs/tunings", { auth: false }),
  create: (payload: TabCreateRequest) =>
    apiRequest<TabDetail>("/api/tabs", { method: "POST", body: payload, auth: false }),
  update: (id: string, payload: TabUpdateRequest) =>
    apiRequest<TabDetail>(`/api/tabs/${id}`, { method: "PUT", body: payload }),
  get: (id: string) => apiRequest<TabDetail>(`/api/tabs/${id}`, { auth: false }),
  remove: (id: string) => apiRequest<void>(`/api/tabs/${id}`, { method: "DELETE" }),
  search: (q: string | undefined, page: number, pageSize: number) =>
    apiRequest<TabListResponse>("/api/tabs", { query: { q, page, page_size: pageSize }, auth: false }),
  vote: (id: string) => apiRequest<VoteResponse>(`/api/tabs/${id}/vote`, { method: "POST" }),
};

export const UsersApi = {
  get: (username: string) => apiRequest<UserPublic>(`/api/users/${username}`, { auth: false }),
  tabs: (username: string, page: number, pageSize: number) =>
    apiRequest<TabListResponse>(`/api/users/${username}/tabs`, {
      query: { page, page_size: pageSize },
      auth: false,
    }),
};
