import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// Render the real Home component with slow/failed API requests. No real
// accounts, database changes, browser sessions or production data are used.
const root = process.cwd();
const require = createRequire(resolve(root, "artifacts/api-server/package.json"));
const { build } = require("esbuild");
const apiMocks = `
  const result = (key) => globalThis.homeFixture[key] ?? { data: [] };
  export const useGetMe = () => result("me");
  export const useGetClubOverview = () => result("overview");
  export const useGetFeed = () => result("feed");
  export const useListUpcomingEvents = () => result("events");
  export const useListTeams = () => result("teams");
  export const useMarkTeamSeen = () => ({ mutate() {} });
  ${["Me", "ClubOverview", "Feed", "ListUpcomingEvents", "ListTeams", "ListTeamUnreads"].map((name) =>
    `export const ${name.startsWith("List") ? "get" + name : "getGet" + name}QueryKey = () => ["${name}"];`).join("\n")}
`;
const uiMocks = `
  import React from "react";
  export const Card = ({children}) => React.createElement("div", null, children);
  export const Button = ({children}) => React.createElement("button", null, children);
  export const PostCard = ({post}) => React.createElement("p", null, post.body);
  export const ContentPlaceholder = ({label}) => React.createElement("div", {role:"status"}, label);
  export const ErrorState = () => React.createElement("div", {role:"alert"}, "Could not load. Try again");
  export const EmptyState = ({title}) => React.createElement("p", null, title);
  export const PostComposer = () => null;
  export const PushNotificationPrompt = () => null;
  export const Avatar = Card;
  export const AvatarFallback = Card;
  export const AvatarImage = () => null;
  export const useTeamUnreads = () => ({data: []});
`;
const bundle = await build({
  stdin: {
    contents: `
      import React from "react";
      import {renderToStaticMarkup} from "react-dom/server";
      import Home from "@/pages/home";
      export function render(fixture) {
        globalThis.homeFixture = fixture;
        return renderToStaticMarkup(React.createElement(Home));
      }
    `,
    resolveDir: resolve(root, "artifacts/clubhub"),
    loader: "tsx",
  },
  bundle: true, platform: "node", format: "cjs", write: false,
  define: { "import.meta.env": "{}" },
  jsx: "automatic",
  plugins: [{
    name: "home-api-fixtures",
    setup(builder) {
      builder.onResolve({filter: /^(@workspace\/api-client-react|@tanstack\/react-query|wouter|@\/lib\/active-team|@\/components\/)/}, ({path}) => ({path, namespace:"fixture"}));
      builder.onLoad({filter: /.*/, namespace:"fixture"}, ({path}) => ({
        contents: path === "@workspace/api-client-react" ? apiMocks
          : path === "@tanstack/react-query" ? "export const useQueryClient = () => ({invalidateQueries(){}});"
          : path === "wouter" ? `import React from "react"; export const Link = ({children,href}) => React.createElement("a",{href},children);`
          : path === "@/lib/active-team" ? "export const useActiveTeam = () => ({activeTeamId: 1, setActiveTeamId(){}});"
          : uiMocks,
        resolveDir: resolve(root, "artifacts/clubhub"),
      }));
      builder.onResolve({filter: /^@\//}, ({path}) => ({path: resolve(root, "artifacts/clubhub/src", path.slice(2) + (path.endsWith("home") ? ".tsx" : ".ts"))}));
    },
  }],
});
const output = {exports: {}};
new Function("module", "exports", "require", bundle.outputFiles[0].text)(output, output.exports, require);
const render = output.exports.render;
const person = {person: {id: 1}, memberships: []};
const post = {id: 1, teamId: 1, body: "A team update is ready"};
const event = {
  id: 1, title: "Upcoming training", teamName: "Rovers", type: "training",
  startsAt: "2099-12-01T09:00:00Z", location: null,
};
const fixture = (admin = false) => ({
  me: {data: {...person, isClubAdmin: admin}},
  feed: {data: [post]}, events: {data: [event]}, teams: {data: []},
  overview: {data: {recentPosts: [post]}},
});

test("members see next session while news is still loading", () => {
  const html = render({...fixture(), feed: {isLoading: true}});
  assert.match(html, /Upcoming training/);
  assert.match(html, /Loading team news/);
  assert.doesNotMatch(html, /No updates yet/);
});

test("members see news while sessions or the desktop team list load", () => {
  const html = render({...fixture(), events: {isLoading: true}, teams: {isLoading: true}});
  assert.match(html, /A team update is ready/);
  assert.match(html, /Loading next session/);
  assert.doesNotMatch(html, /No upcoming sessions/);
});

test("admins see next session while their overview loads or fails", () => {
  for (const overview of [{isLoading: true}, {error: new Error("Offline")}]) {
    const html = render({...fixture(true), overview});
    assert.match(html, /Upcoming training/);
    assert.match(html, /Loading team news|Could not load/);
    assert.doesNotMatch(html, /No recent team news/);
  }
});

test("a team-list error does not hide news and offers a retry", () => {
  const html = render({...fixture(), teams: {error: new Error("Offline")}});
  assert.match(html, /A team update is ready/);
  assert.match(html, /Try again/);
});
