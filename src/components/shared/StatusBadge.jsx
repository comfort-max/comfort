import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusStyles = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  deactivated: "bg-red-50 text-red-600 border-red-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  partial: "bg-orange-50 text-orange-600 border-orange-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paid_excess: "bg-sky-50 text-sky-800 border-sky-200",
  overpaid: "bg-cyan-50 text-cyan-800 border-cyan-200",
  completed: "bg-blue-50 text-blue-700 border-blue-200",
  cancelled: "bg-gray-50 text-gray-500 border-gray-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  with_vendor: "bg-purple-50 text-purple-700 border-purple-200",
  ready_for_delivery: "bg-cyan-50 text-cyan-700 border-cyan-200",
  delivered_unpaid: "bg-amber-50 text-amber-700 border-amber-200",
  delivered_paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  full_time: "bg-blue-50 text-blue-700 border-blue-200",
  part_time: "bg-violet-50 text-violet-700 border-violet-200",
};

const labelMap = {
  active: "Active",
  deactivated: "Deactivated",
  pending: "Pending",
  partial: "Partial",
  paid: "Paid",
  paid_excess: "Paid Excess",
  overpaid: "Overpaid",
  completed: "Completed",
  cancelled: "Cancelled",
  accepted: "Accepted",
  with_vendor: "Assigned to Vendor",
  order_placed: "Order Placed",
  ready_for_delivery: "Ready",
  delivered_unpaid: "Delivered - Unpaid",
  delivered_paid: "Delivered & Paid",
  full_time: "Full Time",
  part_time: "Part Time",
};

export default function StatusBadge({ status, label }) {
  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium capitalize", statusStyles[status] || "bg-gray-50 text-gray-600")}>
      {label || labelMap[status] || status?.replace(/_/g, ' ')}
    </Badge>
  );
}