import { Link } from "wouter";
import { format } from "date-fns";
import { MessageSquare } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function PostCard({ post, linkToTeam = true }: { post: any; linkToTeam?: boolean }) {
  const card = (
    <Card
      className={
        "p-5 rounded-2xl" +
        (linkToTeam ? " hover:shadow-md transition-all cursor-pointer" : "")
      }
    >
      <div className="flex items-start gap-3 mb-3">
        <Avatar className="h-10 w-10 border shadow-sm">
          <AvatarImage src={post.author.avatarUrl} />
          <AvatarFallback>{post.author.firstName?.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="font-semibold text-sm">{post.author.fullName}</span>
          <div className="flex items-center text-xs text-muted-foreground">
            <span>{post.teamName}</span>
            <span className="mx-1.5">•</span>
            <span>{format(new Date(post.createdAt), "MMM d")}</span>
          </div>
        </div>
        {post.pinned && (
          <Badge variant="secondary" className="ml-auto text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">PINNED</Badge>
        )}
      </div>

      {post.title && <h4 className="font-bold mb-1.5">{post.title}</h4>}
      <p className="text-sm text-foreground/90 line-clamp-3 leading-relaxed">
        {post.body}
      </p>

      {post.commentCount > 0 && (
        <div className="mt-4 flex items-center text-xs font-medium text-muted-foreground">
          <MessageSquare className="h-4 w-4 mr-1.5" />
          {post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}
        </div>
      )}
    </Card>
  );

  if (!linkToTeam) return card;
  return <Link href={`/teams/${post.teamId}?post=${post.id}`}>{card}</Link>;
}
