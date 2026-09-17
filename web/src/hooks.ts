import { useEffect, useState } from 'react';
import { api } from './api';
import type { Collection, StatusResponse, TagCount } from './types';

export function useCollections(refreshKey: number): Collection[] {
  const [collections, setCollections] = useState<Collection[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .listCollections()
      .then((result) => {
        if (alive) setCollections(result);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  return collections;
}

export function useTags(refreshKey: number): TagCount[] {
  const [tags, setTags] = useState<TagCount[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .tags()
      .then((result) => {
        if (alive) setTags(result);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  return tags;
}

export function useStatus(refreshKey: number, pollMs = 0): StatusResponse | null {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      api
        .status()
        .then((result) => {
          if (alive) setStatus(result);
        })
        .catch(() => undefined);
    };
    load();
    if (pollMs <= 0) {
      return () => {
        alive = false;
      };
    }
    const timer = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [refreshKey, pollMs]);
  return status;
}
