/**
 * Typed endpoint functions wrapping `apiRequest`. This is the only module
 * that should know the actual URL paths for the backend API.
 */
import { apiRequest } from "./apiClient";
import type {
  FavoriteResponse,
  SetlistDetail,
  SetlistSummary,
  TabCreateRequest,
  TabDetail,
  TabListResponse,
  TabRevisionDetail,
  TabRevisionSummary,
  TabSearchFilters,
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
  search: (filters: TabSearchFilters, page: number, pageSize: number) =>
    apiRequest<TabListResponse>("/api/tabs", { query: { ...filters, page, page_size: pageSize }, auth: false }),
  vote: (id: string) => apiRequest<VoteResponse>(`/api/tabs/${id}/vote`, { method: "POST" }),
  revisions: (id: string) => apiRequest<TabRevisionSummary[]>(`/api/tabs/${id}/revisions`),
  revision: (id: string, revisionId: string) =>
    apiRequest<TabRevisionDetail>(`/api/tabs/${id}/revisions/${revisionId}`),
  restoreRevision: (id: string, revisionId: string) =>
    apiRequest<TabDetail>(`/api/tabs/${id}/revisions/${revisionId}/restore`, { method: "POST" }),
  favorite: (id: string) => apiRequest<FavoriteResponse>(`/api/tabs/${id}/favorite`, { method: "POST" }),
  fork: (id: string) => apiRequest<TabDetail>(`/api/tabs/${id}/fork`, { method: "POST" }),
};

export const LibraryApi = {
  favorites: () => apiRequest<TabListResponse>("/api/me/favorites"),
  setlists: () => apiRequest<SetlistSummary[]>("/api/setlists"),
  setlist: (id: string) => apiRequest<SetlistDetail>(`/api/setlists/${id}`),
  createSetlist: (name: string) => apiRequest<SetlistDetail>("/api/setlists", { method: "POST", body: { name } }),
  updateSetlist: (id: string, name: string, tabIds: string[]) =>
    apiRequest<SetlistDetail>(`/api/setlists/${id}`, { method: "PUT", body: { name, tab_ids: tabIds } }),
  addToSetlist: (id: string, tabId: string) =>
    apiRequest<SetlistDetail>(`/api/setlists/${id}/tabs`, { method: "POST", body: { tab_id: tabId } }),
  deleteSetlist: (id: string) => apiRequest<void>(`/api/setlists/${id}`, { method: "DELETE" }),
};

export const UsersApi = {
  get: (username: string) => apiRequest<UserPublic>(`/api/users/${username}`, { auth: false }),
  tabs: (username: string, page: number, pageSize: number) =>
    apiRequest<TabListResponse>(`/api/users/${username}/tabs`, {
      query: { page, page_size: pageSize },
      auth: false,
    }),
};
