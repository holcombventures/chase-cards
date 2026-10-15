import type { Metadata } from "next";
import { HypeTool } from "@/components/tools/HypeTool";

export const metadata: Metadata = {
  title: "Hype tracker",
  description:
    "Score cards from release timing, public tournament lists, and subreddit posts, next to live prices.",
};

export default function HypePage() {
  return <HypeTool />;
}
