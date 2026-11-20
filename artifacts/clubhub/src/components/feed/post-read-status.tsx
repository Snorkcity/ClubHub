import { useEffect, useRef, useState, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useMarkPostRead,
  getGetFeedQueryKey,
  getGetClubOverviewQueryKey,
  getListTeamPostsQueryKey,
  getGetPostQueryKey,
  getListPostReadersQueryKey,
  type Post,
} from "@workspace/api-client-react";
import { PostReadersDialog } from "./post-readers-dialog";

/** Loading a card isn't reading it. Its heading must be on screen for one
 * continuous second while the app is visible. Do not mark off-screen cards or
 * cards sitting in a background browser tab as read. */
export function PostReadStatus({ post, headingRef }: {
  post: Post;
  headingRef: RefObject<HTMLDivElement | null>;
}) {
  const queryClient = useQueryClient();
  const recorded = useRef(false);
  const [justRead, setJustRead] = useState(false);
  const { mutate } = useMarkPostRead({ mutation: { retry: 1 } });

  useEffect(() => {
    if (post.hasRead !== false || recorded.current || !headingRef.current) return;
    let visible = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const clear = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    const update = () => {
      clear();
      if (!visible || document.visibilityState !== "visible" || recorded.current) return;
      timer = setTimeout(() => {
        recorded.current = true;
        mutate({ postId: post.id }, {
          onSuccess: () => {
            if (!disposed) setJustRead(true);
            void queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
            void queryClient.invalidateQueries({ queryKey: getGetClubOverviewQueryKey() });
            void queryClient.invalidateQueries({ queryKey: getListTeamPostsQueryKey(post.teamId) });
            void queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(post.id) });
            void queryClient.invalidateQueries({ queryKey: getListPostReadersQueryKey(post.id) });
          },
          onError: () => { recorded.current = false; },
        });
      }, 1000);
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.75);
      update();
    }, { threshold: [0, 0.75] });
    observer.observe(headingRef.current);
    document.addEventListener("visibilitychange", update);
    return () => {
      disposed = true;
      clear();
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [post.id, post.teamId, post.hasRead, headingRef, mutate, queryClient]);

  if (post.readerCount === undefined || post.readCount === undefined) return null;
  // Show the successful read immediately while the shared feed refreshes.
  const readCount = Math.min(post.readerCount, post.readCount + (justRead && !post.hasRead ? 1 : 0));
  return (
    <PostReadersDialog postId={post.id} readCount={readCount} readerCount={post.readerCount} />
  );
}
