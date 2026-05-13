import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, Download, Printer, ChevronUp, ChevronDown, ChevronsUpDown, FileText, FileSpreadsheet, FileDown } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import { cn, sortStringsForDisplay, localeDisplayCompare } from "@/lib/utils";
import { exportPDF } from "@/components/shared/exportPDF";
import { printReport } from "@/components/shared/PrintReport";
import { formatCurrencyAmount } from "@/lib/currency";
import { downloadTableAsCsv, downloadTableAsExcel } from "@/lib/tableDataExport";
import { toast } from "sonner";

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <ChevronsUpDown className="w-3 h-3 opacity-30 inline ml-0.5" />;
  return sortDir === 'asc'
    ? <ChevronUp className="w-3 h-3 inline ml-0.5 text-primary" />
    : <ChevronDown className="w-3 h-3 inline ml-0.5 text-primary" />;
}

export default function DeliveryTable({
  tableId,
  title,
  items = [],
  bills = [],
  selectedIds = [],
  onSelectionChange,
  showVendor = false,
  showDeliveredBy = false,
  showStatus = false,
  useVendorAmount = false,  // true = show vendor_amount (tabs 1&2), false = show customer amount (tabs 3&4)
  extraFilters,
  actions,
  companySettings = {},
  dateRange,
}) {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('bill_number');
  const [sortDir, setSortDir] = useState('asc');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const fmtAmount = (n) => formatCurrencyAmount(n, companySettings);

  const getBill = (billId) => bills.find(b => b.id === billId);

  const getDisplayAmount = (item) => useVendorAmount ? (item.vendor_amount || 0) : (item.amount || 0);

  const uniqueVendors = useMemo(() => {
    const map = {};
    items.forEach((i) => {
      if (i.vendor_id) map[i.vendor_id] = i.vendor_name;
    });
    return Object.entries(map).sort((a, b) => localeDisplayCompare(a[1], b[1]));
  }, [items]);

  const uniqueStatuses = useMemo(
    () => sortStringsForDisplay([...new Set(items.map((i) => i.delivery_status).filter(Boolean))]),
    [items]
  );

  const filtered = useMemo(() => {
    let result = items;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(i =>
        (i.item_name || '').toLowerCase().includes(s) ||
        (i.bill_number || '').toLowerCase().includes(s) ||
        (i.vendor_name || '').toLowerCase().includes(s) ||
        (getBill(i.bill_id)?.customer_name || '').toLowerCase().includes(s)
      );
    }
    if (vendorFilter !== 'all') result = result.filter(i => i.vendor_id === vendorFilter);
    if (statusFilter !== 'all') result = result.filter(i => i.delivery_status === statusFilter);

    result = [...result].sort((a, b) => {
      let aVal, bVal;
      const billA = getBill(a.bill_id);
      const billB = getBill(b.bill_id);
      switch (sortCol) {
        case 'bill_number': aVal = a.bill_number || ''; bVal = b.bill_number || ''; break;
        case 'bill_date': aVal = billA?.bill_date || ''; bVal = billB?.bill_date || ''; break;
        case 'item_name': aVal = a.item_name || ''; bVal = b.item_name || ''; break;
        case 'customer': aVal = billA?.customer_name || ''; bVal = billB?.customer_name || ''; break;
        case 'qty': aVal = a.quantity || 0; bVal = b.quantity || 0; break;
        case 'amount': aVal = getDisplayAmount(a); bVal = getDisplayAmount(b); break;
        case 'vendor': aVal = a.vendor_name || ''; bVal = b.vendor_name || ''; break;
        case 'pickup_by': aVal = billA?.pickup_employee_name || ''; bVal = billB?.pickup_employee_name || ''; break;
        case 'delivered_by': aVal = a.delivered_by_name || ''; bVal = b.delivered_by_name || ''; break;
        case 'status': aVal = a.delivery_status || ''; bVal = b.delivery_status || ''; break;
        default: aVal = ''; bVal = '';
      }
      const cmp = typeof aVal === 'number' ? aVal - bVal : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [items, search, sortCol, sortDir, vendorFilter, statusFilter]);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const allSelected = filtered.length > 0 && filtered.every(i => selectedIds.includes(i.id));
  const toggleAll = (checked) => {
    if (checked) onSelectionChange?.([...new Set([...selectedIds, ...filtered.map(i => i.id)])]);
    else onSelectionChange?.(selectedIds.filter(id => !filtered.map(i => i.id).includes(id)));
  };
  const toggleOne = (id) => {
    onSelectionChange?.(selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id]);
  };

  const SortTh = ({ col, label, className = '' }) => (
    <th className={cn("p-2 text-left cursor-pointer select-none hover:text-foreground whitespace-nowrap", className)} onClick={() => toggleSort(col)}>
      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  );

  const getExportRows = () => filtered.map(item => {
    const bill = getBill(item.bill_id);
    const row = {
      'Bill #': item.bill_number || '',
      'Bill Date': bill?.bill_date || '',
      'Item': item.item_name || '',
      'Category': item.category || '',
      'Customer': bill?.customer_name || '',
      'Qty': item.quantity || 0,
      [useVendorAmount ? 'Vendor Amount' : 'Amount']: getDisplayAmount(item),
    };
    if (showVendor) row['Vendor'] = item.vendor_name || '';
    row['Pickup By'] = bill?.pickup_employee_name || '';
    if (showDeliveredBy) row['Delivered By'] = item.delivered_by_name || '';
    if (showStatus) row['Status'] = item.delivery_status || '';
    row['Remarks'] = item.remarks || '';
    return row;
  });

  const amountLabel = useVendorAmount ? 'Vendor Amt' : 'Amount';

  return (
    <div className="space-y-3">
      {/* Filters row */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 w-48 text-sm" />
        </div>
        {showVendor && uniqueVendors.length > 0 && (
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="All Vendors" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              {uniqueVendors.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {showStatus && uniqueStatuses.length > 0 && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {uniqueStatuses.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {extraFilters}
        <div className="ml-auto flex gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                <Download className="w-3.5 h-3.5" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  const rows = getExportRows();
                  if (!rows.length) {
                    toast.error("Nothing to export");
                    return;
                  }
                  downloadTableAsCsv(rows, null, companySettings, title);
                }}
              >
                <FileDown className="w-4 h-4 mr-2" /> Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  const rows = getExportRows();
                  if (!rows.length) {
                    toast.error("Nothing to export");
                    return;
                  }
                  downloadTableAsExcel(rows, null, companySettings, title, "Export");
                }}
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" /> Export as Excel
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={async () => {
                const rows = getExportRows();
                if (!rows.length) {
                  toast.error("Nothing to export");
                  return;
                }
                const cols = Object.keys(rows[0]).map(k => ({ header: k, key: k }));
                await exportPDF({ title, dateRange, columns: cols, rows, companySettings });
              }}>
                <FileText className="w-4 h-4 mr-2" /> Export as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={async () => {
                const rows = getExportRows();
                if (!rows.length) {
                  toast.error("Nothing to export");
                  return;
                }
                const cols = Object.keys(rows[0]).map(k => ({ header: k, key: k }));
                await printReport({ title, dateRange, columns: cols, rows, companySettings });
              }}>
                <Printer className="w-4 h-4 mr-2" /> Print
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table id={tableId} className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                {onSelectionChange && (
                  <th className="p-2 w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                )}
                <SortTh col="bill_number" label="Bill #" />
                <SortTh col="bill_date" label="Bill Date" />
                <SortTh col="item_name" label="Item" />
                <SortTh col="customer" label="Customer" />
                <SortTh col="qty" label="Qty" className="text-right" />
                <SortTh col="amount" label={amountLabel} className="text-right" />
                {showVendor && <SortTh col="vendor" label="Vendor" />}
                <SortTh col="pickup_by" label="Pickup By" />
                {showDeliveredBy && <SortTh col="delivered_by" label="Delivered By" />}
                {showStatus && <SortTh col="status" label="Status" />}
                {actions && <th className="p-2 text-left">Action</th>}
                <th className="p-2 text-left">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const bill = getBill(item.bill_id);
                return (
                  <tr key={item.id} className={cn("border-b hover:bg-muted/30", selectedIds.includes(item.id) && "bg-primary/5")}>
                    {onSelectionChange && (
                      <td className="p-2"><Checkbox checked={selectedIds.includes(item.id)} onCheckedChange={() => toggleOne(item.id)} /></td>
                    )}
                    <td className="p-2 font-medium">{item.bill_number}</td>
                    <td className="p-2 text-muted-foreground">{bill?.bill_date || '-'}</td>
                    <td className="p-2">{item.item_name}</td>
                    <td className="p-2">{bill?.customer_name || '-'}</td>
                    <td className="p-2 text-right">{item.quantity}</td>
                    <td className="p-2 text-right font-medium">{fmtAmount(getDisplayAmount(item))}</td>
                    {showVendor && <td className="p-2">{item.vendor_name || '-'}</td>}
                    <td className="p-2">{bill?.pickup_employee_name || '-'}</td>
                    {showDeliveredBy && <td className="p-2">{item.delivered_by_name || '-'}</td>}
                    {showStatus && <td className="p-2"><StatusBadge status={item.delivery_status} /></td>}
                    {actions && <td className="p-2">{actions(item)}</td>}
                    <td className="p-2 text-xs text-muted-foreground max-w-[120px] truncate">{item.remarks || '-'}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={20} className="text-center py-8 text-muted-foreground">No items found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        {filtered.length} record{filtered.length !== 1 ? 's' : ''}
        {selectedIds.length > 0 ? ` · ${selectedIds.length} selected` : ''}
      </div>
    </div>
  );
}