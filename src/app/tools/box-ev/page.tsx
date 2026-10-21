import type { Metadata } from "next";
import { BoxEvTool } from "@/components/tools/BoxEvTool";

export const metadata: Metadata = {
  title: "Box EV calculator",
  description:
    "Price a specific sealed product from its TCGplayer market and live pack EV. Pack count and pull rates are editable estimates, not advice.",
};

export default function BoxEvPage() {
  return <BoxEvTool />;
}
