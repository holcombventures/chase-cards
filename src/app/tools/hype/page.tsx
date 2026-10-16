import type { Metadata } from "next";
import { HypeTool } from "@/components/tools/HypeTool";

export const metadata: Metadata = {
  title: "Hype tracker",
  description: "See which cards are heating up, and why.",
};

export default function HypePage() {
  return <HypeTool />;
}
