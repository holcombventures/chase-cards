import type { Metadata } from "next";
import { GradingTool } from "@/components/tools/GradingTool";

export const metadata: Metadata = {
  title: "Grading ROI checker",
  description:
    "Compare a live raw card price with estimated graded values. Checklist, fees, and multipliers are editable estimates, not grading advice.",
};

export default function GradingRoiPage() {
  return <GradingTool />;
}
