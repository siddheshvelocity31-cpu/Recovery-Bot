/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import * as React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface Column<T> {
  key: string;
  header: string;
  accessor: (row: T) => React.ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
  width?: string;
  align?: "left" | "center" | "right";
  renderHeader?: (ctx: { sortDirection: "asc" | "desc" | "none"; onSort: () => void }) => React.ReactNode;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyAccessor: (row: T) => string;
  sortable?: boolean;
  filterable?: boolean;
  selectable?: boolean;
  onSelectionChange?: (selectedKeys: Set<string>) => void;
  emptyMessage?: string;
  loading?: boolean;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
  };
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyAccessor,
  sortable = true,
  filterable = false,
  selectable = false,
  onSelectionChange,
  emptyMessage = "No data available",
  loading = false,
  pagination,
  className,
}: DataTableProps<T>) {
  const [sortConfig, setSortConfig] = React.useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(new Set());
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>({});

  const handleSort = (key: string) => {
    if (!sortable) return;
    setSortConfig((current) => {
      if (current?.key === key) {
        return { key, direction: current.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleSelectionChange = (key: string, selected: boolean) => {
    const newSelected = new Set(selectedKeys);
    if (selected) {
      newSelected.add(key);
    } else {
      newSelected.delete(key);
    }
    setSelectedKeys(newSelected);
    onSelectionChange?.(newSelected);
  };

  const sortedAndFilteredData = React.useMemo(() => {
    let result = [...data];

    // Apply filters
    if (filterable) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          const column = columns.find((c) => c.key === key);
          if (column?.filterable) {
            result = result.filter((row) => {
              const cellValue = String(column.accessor(row)).toLowerCase();
              return cellValue.includes(value.toLowerCase());
            });
          }
        }
      });
    }

    // Apply sorting
    if (sortConfig && sortable) {
      const column = columns.find((c) => c.key === sortConfig.key);
      if (column?.sortable) {
        result.sort((a, b) => {
          const aVal = column.accessor(a);
          const bVal = column.accessor(b);
          const aStr = String(aVal).toLowerCase();
          const bStr = String(bVal).toLowerCase();
          if (sortConfig.direction === "asc") {
            return aStr.localeCompare(bStr);
          }
          return bStr.localeCompare(aStr);
        });
      }
    }

    return result;
  }, [data, filters, sortConfig, sortable, filterable, columns]);

  const handleSelectAll = (selected: boolean) => {
    const newSelected = new Set<string>();
    if (selected) {
      data.forEach((row) => newSelected.add(keyAccessor(row)));
    }
    setSelectedKeys(newSelected);
    onSelectionChange?.(newSelected);
  };

  const displayedData = pagination
    ? sortedAndFilteredData.slice(
        (pagination.page - 1) * pagination.pageSize,
        pagination.page * pagination.pageSize
      )
    : sortedAndFilteredData;

  const handleColumnResize = (key: string, width: number) => {
    setColumnWidths((prev) => ({ ...prev, [key]: width }));
  };

  const allSelected = data.length > 0 && data.every((row) => selectedKeys.has(keyAccessor(row)));
  const someSelected = data.length > 0 && data.some((row) => selectedKeys.has(keyAccessor(row)));

  const emptyRow = (
    <tr>
      <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-12 text-center text-muted">
        {loading ? "Loading..." : emptyMessage}
      </td>
    </tr>
  );

  const rows = data.map((row) => {
    const rowKey = keyAccessor(row);
    const isRowSelected = selectedKeys.has(rowKey);
    return (
      <tr
        key={rowKey}
        className={`transition-colors ${selectedKeys.has(rowKey) ? "bg-primary/5 dark:bg-primary/10" : ""} hover:bg-neutral-50/50 dark:hover:bg-white/5`}
      >
        {selectable && (
          <td className="px-3 py-2">
            <input
              type="checkbox"
              checked={selectedKeys.has(rowKey)}
              onChange={(e) => handleSelectionChange(rowKey, e.target.checked)}
              className="rounded border-neutral-300 text-primary focus:ring-1 focus:ring-primary"
            />
          </td>
        )}
        {columns.map((column) => (
          <td
            key={column.key}
            className={`px-3 py-2 text-primary border-t border-neutral-200/50 dark:border-white/10 ${column.align === "center" ? "text-center" : ""} ${column.align === "right" ? "text-right" : ""}`}
          >
            {column.accessor(row)}
          </td>
        ))}
      </tr>
    );
  });

  const tbodyContent = data.length === 0 ? (
    <tr>
      <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-12 text-center text-muted">
        {loading ? "Loading..." : emptyMessage}
      </td>
    </tr>
  ) : (
    rows
  );

  return (
    <div className={`rounded-sm border border-neutral-200 dark:border-white/15 overflow-hidden ${className || ""}`}>
      <div className="relative overflow-x-auto">
        {loading && (
          <div className="absolute inset-0 bg-white/50 dark:bg-neutral-950/50 flex items-center justify-center z-10">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        <table className="w-full min-w-max text-body-sm">
          <thead>
            <tr className="bg-neutral-50/50 dark:bg-neutral-900/50 border-b border-neutral-200/50 dark:border-white/10">
              {selectable && (
                <th className="w-12 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={data.length > 0 && data.every((row) => selectedKeys.has(keyAccessor(row)))}
                    indeterminate={data.some((row) => selectedKeys.has(keyAccessor(row))) && !data.every((row) => selectedKeys.has(keyAccessor(row)))}
                    onChange={(e) => {
                      const allSelected = data.every((row) => selectedKeys.has(keyAccessor(row)));
                      if (allSelected) {
                        setSelectedKeys(new Set());
                      } else {
                        const newSelected = new Set(selectedKeys);
                        data.forEach((row) => newSelected.add(keyAccessor(row)));
                        setSelectedKeys(newSelected);
                      }
                    }}
                    className="rounded border-neutral-300 text-primary focus:ring-1 focus:ring-primary"
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {columns.map((column) => {
                const widthClass = column.width ? `w-[${column.width}]` : "";
                return (
                  <th
                    key={column.key}
                    className={cn(
                      "px-3 py-2 text-left text-label uppercase tracking-widest text-secondary bg-neutral-50/50 dark:bg-neutral-900/50 border-b border-neutral-200/50 dark:border-white/10",
                      column.align === "center" && "text-center",
                      column.align === "right" && "text-right",
                      column.resizable && "relative cursor-col-resize",
                      column.width && `w-[${column.width}]`,
                    )}
                    style={{ width: columnWidths[column.key] ? `${columnWidths[column.key]}px` : column.width }}
                  >
                    <div className="flex items-center gap-2">
                      {column.renderHeader ? (
                        column.renderHeader({
                          sortDirection: sortConfig?.key === column.key ? sortConfig.direction : "none",
                          onSort: () => column.sortable && handleSort(column.key),
                        })
                      ) : (
                        <>
                          <span className="font-semibold">{column.header}</span>
                          {sortable && column.sortable && sortConfig?.key === column.key && (
                            <span className="ml-1">
                              {sortConfig.direction === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </span>
                          )}
                        </>
                      )}
                    {filterable && column.filterable && (
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={filters[column.key] || ""}
                        onChange={(e) => handleFilterChange(column.key, e.target.value)}
                        className="ml-2 h-6 w-24 rounded-sm border border-neutral-300 bg-white px-2 text-body-sm placeholder:text-muted focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950 focus:outline-none dark:border-white/20 dark:bg-neutral-800 dark:placeholder:text-neutral-500 dark:focus:border-white"
                      />
                    )}
                    {column.resizable && (
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-neutral-200 dark:hover:bg-neutral-700"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const startX = e.clientX;
                          const startWidth = columnWidths[column.key] || 150;
                          const handleMouseMove = (moveEvent: MouseEvent) => {
                            const newWidth = Math.max(80, startWidth + moveEvent.clientX - startX);
                            handleColumnResize(column.key, newWidth);
                          };
                          const handleMouseUp = () => {
                            document.removeEventListener("mousemove", handleMouseMove);
                            document.removeEventListener("mouseup", handleMouseUp);
                          };
                          document.addEventListener("mousemove", handleMouseMove);
                          document.addEventListener("mouseup", handleMouseUp);
                        }}
                      />
                    )}
                  </div>
                </th>
              )})}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200/50 dark:divide-white/10">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-12 text-center text-muted">
                  {loading ? "Loading..." : emptyMessage}
                </td>
              </tr>
            ) : (
              rows
            )}
          </tbody>
        </table>
      </div>
      {pagination && (
        <div className="px-4 py-3 border-t border-neutral-200/50 dark:border-white/10 flex items-center justify-between text-body-sm text-secondary">
          <span>
            Showing {(pagination.page - 1) * pagination.pageSize + 1} to {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
          </span>
          <div className="flex items-center gap-2">
            <select
              value={pagination.pageSize}
              onChange={(e) => pagination.onPageSizeChange(Number(e.target.value))}
              className="h-8 w-24 rounded-sm border border-neutral-300 bg-white px-2 text-body-sm focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950 focus:outline-none dark:border-white/20 dark:bg-neutral-800"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="px-3 py-1.5 text-sm font-medium rounded-sm border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              Previous
            </button>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page * pagination.pageSize >= pagination.total}
              className="px-3 py-1.5 text-sm font-medium rounded-sm border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { DataTable };
export type { Column, DataTableProps };