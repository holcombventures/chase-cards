import type { Metadata } from "next";
import { BoxEvTool } from "@/components/tools/BoxEvTool";

export const metadata: Metadata = {
  title: "Box EV calculator",
  description:
    "Estimate a booster box from live card prices. Box price, pack count, and pull rates are editable estimates, not advice.",
};

export default function BoxEvPage() {
  return <BoxEvTool />;
}
