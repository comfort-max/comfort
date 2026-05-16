import React, { useMemo } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Package } from "lucide-react";
import { useAppCurrency } from "@/hooks/useAppCurrency";
import { sortByLocaleKey } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

export default function VendorOrdersPage() {
  const qc = useQueryClient();
  const { format: fmt } = useAppCurrency();
  const { can } = usePermissions();
  const canAssignVendorOrders = can("vendor_orders", "edit");

  const { data: billItems = [] } = useQuery({ queryKey: ['bill-items-vo'], queryFn: () => db.BillItem.list('-created_date', 2000) });
  const { data: bills = [] } = useQuery({ queryKey: ['bills-vo'], queryFn: () => db.Bill.list('-created_date', 1000) });
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors-active'], queryFn: () => db.Vendor.filter({ status: 'active' }) });
  const { data: vendorRates = [] } = useQuery({ queryKey: ['vendor-rates'], queryFn: () => db.VendorRate.list('vendor_id', 2000) });

  const vendorsSorted = useMemo(() => sortByLocaleKey(vendors), [vendors]);

  const unassignedItems = billItems.filter(
    (i) => !i.vendor_id && (!i.delivery_status || i.delivery_status === "pending")
  );
  const billGroups = {};
  unassignedItems.forEach(item => { if (!billGroups[item.bill_id]) billGroups[item.bill_id] = []; billGroups[item.bill_id].push(item); });

  const assignMutation = useMutation({
    mutationFn: async ({ itemId, vendorId }) => {
      const vendor = vendors.find(v => v.id === vendorId);
      const item = billItems.find(i => i.id === itemId);
      const vRate = vendorRates.find(r => r.vendor_id === vendorId && r.item_name === item?.item_name);
      await db.BillItem.update(itemId, { vendor_id: vendorId, vendor_name: vendor?.name || '', vendor_rate: vRate?.price || 0, vendor_amount: (vRate?.price || 0) * (item?.quantity || 1), delivery_status: 'with_vendor' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bill-items-vo'] });
      qc.invalidateQueries({ queryKey: ['bill-items-vj'] });
      qc.invalidateQueries({ queryKey: ['bills-vj'] });
      qc.invalidateQueries({ queryKey: ['bill-items-delivery'] });
      toast.success("Vendor assigned");
    }
  });

  const assignAllMutation = useMutation({
    mutationFn: async ({ billId, vendorId }) => {
      const items = unassignedItems.filter(i => i.bill_id === billId);
      const vendor = vendors.find(v => v.id === vendorId);
      await Promise.all(items.map(item => {
        const vRate = vendorRates.find(r => r.vendor_id === vendorId && r.item_name === item.item_name);
        return db.BillItem.update(item.id, { vendor_id: vendorId, vendor_name: vendor?.name || '', vendor_rate: vRate?.price || 0, vendor_amount: (vRate?.price || 0) * (item.quantity || 1), delivery_status: 'with_vendor' });
      }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bill-items-vo'] });
      qc.invalidateQueries({ queryKey: ['bill-items-vj'] });
      qc.invalidateQueries({ queryKey: ['bills-vj'] });
      qc.invalidateQueries({ queryKey: ['bill-items-delivery'] });
      toast.success("All items assigned");
    }
  });

  const getBill = (billId) => bills.find(b => b.id === billId);

  return (
    <div>
      <PageHeader title="Vendor Distribution" subtitle="Assign bill items to vendors — then go to Vendor Jobs to generate POs" permissionResource="vendor_orders" />
      {Object.keys(billGroups).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No unassigned items. Create bills first, then assign items to vendors here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(billGroups).map(([billId, items]) => {
            const bill = getBill(billId);
            return (
              <Card key={billId} className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">Bill #{bill?.bill_number} - {bill?.customer_name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{bill?.bill_date} · {items.length} items</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Assign all to:</span>
                      <Select disabled={!canAssignVendorOrders} onValueChange={vid => assignAllMutation.mutate({ billId, vendorId: vid })}>
                        <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                        <SelectContent>{vendorsSorted.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-1.5">Item</th><th className="text-left py-1.5">Category</th>
                      <th className="text-right py-1.5">Qty</th><th className="text-right py-1.5">Customer Rate</th>
                      <th className="text-left py-1.5 w-48">Assign Vendor</th>
                    </tr></thead>
                    <tbody>
                      {items.map(item => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-1.5">{item.item_name}</td>
                          <td className="py-1.5 text-muted-foreground">{item.category}</td>
                          <td className="py-1.5 text-right">{item.quantity}</td>
                          <td className="py-1.5 text-right">{fmt(item.rate)}</td>
                          <td className="py-1.5">
                            <Select disabled={!canAssignVendorOrders} onValueChange={vid => assignMutation.mutate({ itemId: item.id, vendorId: vid })}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                              <SelectContent>{vendorsSorted.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}