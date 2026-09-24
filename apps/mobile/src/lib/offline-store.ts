import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import {
  WordbookOfflineStore,
  type OfflineStorage,
  type WordbookApi,
} from './wordbook-offline';

/** Android 端持久化实现：App 重启后已下载词库仍可读取 */
const asyncStorageAdapter: OfflineStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

/** api-client 的方法签名与 WordbookApi 对齐（这里显式收窄，避免依赖具体实现） */
const wordbookApi: WordbookApi = {
  listWordbooks: () => api.vocabulary.listWordbooks(),
  wordbookVersion: (key) => api.vocabulary.wordbookVersion(key),
  exportWords: (key, query) => api.vocabulary.exportWords(key, query),
};

export const offlineStore = new WordbookOfflineStore(asyncStorageAdapter, wordbookApi);
