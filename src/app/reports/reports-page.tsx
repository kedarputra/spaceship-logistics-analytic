import type { ReactNode } from "react";
import { can, type Role } from "@/auth/roles";
import { CardPair } from "@/components/card-pair";
import { CardTitle } from "@/components/card-title";
import { Chart } from "@/components/chart";
import { DataTableDisclosure } from "@/components/chart-card";
import { Icon } from "@/components/icons";
import { MonthPicker } from "@/components/month-picker";
import type { SearchParams } from "@/components/orders-url";
import { PageHeader } from "@/components/page-header";
import { monthLabel, type ReportSection, reportSections, reportWeeks, type SectionId } from "@/components/report-sections";
import { OUTCOME_SERIES } from "@/components/series";
import { Tag } from "@/components/tag";
import { Table } from "@/components/text-table";
import { formatCount } from "@/domain/format";
import { getDataset } from "@/domain/orders";
import { type MonthlyReport, monthlyReport, reportMonths } from "@/tools/report";

const REPORTS_PATH = "/reports";

/** The files a report can be downloaded as, and every order as the file has them (ticket 28). */
function exportFiles(month: string): { href: string; label: string }[] {
  return [
    { href: `/api/reports/${month}.pdf`, label: "Monthly report (PDF)" },
    { href: `/api/reports/${month}.csv`, label: "Monthly report (CSV)" },
    { href: "/api/orders.csv", label: "All orders (CSV)" },
  ];
}

/**
 * The downloads (ticket 34). A role that may not download sees them disabled with a lock, and why; the
 * routes refuse it too (ADR 0012). An admin also gets the way to import data (ticket 35).
 */
function Exports({ role, month }: { role: Role; month: string }) {
  const allowed = can(role, "download");
  return (
    <div role="group" aria-label="Export" className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-2">
        {exportFiles(month).map(({ href, label }) => (
          <li key={label}>
            {allowed ? (
              <a href={href} download className="button-small gap-1.5 no-underline">
                <Icon name="download" size={15} />
                {label}
              </a>
            ) : (
              <button type="button" disabled aria-describedby="export-locked" className="button-small gap-1.5 disabled:cursor-not-allowed disabled:bg-inset disabled:text-muted">
                <Icon name="lock" size={15} />
                {label}
              </button>
            )}
          </li>
        ))}
        {can(role, "import") ? (
          <li>
            <a href="/import" className="button-small gap-1.5 no-underline">
              <Icon name="arrow" size={15} />
              Import data
            </a>
          </li>
        ) : null}
      </ul>
      {allowed ? null : (
        <p id="export-locked" className="flex items-center gap-1.5 text-small text-muted">
          <Icon name="lock" size={14} />
          Analyst role needed
        </p>
      )}
    </div>
  );
}

/** A section's table, a small-sample tag beside each name that is one (ADR 0001 §6). */
function SectionTable({ table }: Pick<ReportSection, "table">) {
  return (
    <Table
      headers={table.headers}
      rowHeaders
      numericFrom={table.numericFrom}
      rows={table.rows.map(([name = "", ...cells], index) => [
        <span key="name">
          {name}
          {table.smallSample?.[index] ? (
            <span className="ml-1.5">
              <Tag tone="warn">small sample</Tag>
            </span>
          ) : null}
        </span>,
        ...cells,
      ])}
      footer={table.footer}
    />
  );
}

/** One section of the report: its title, its period basis once under it, its table, and anything after it. */
function Section({ section, children }: { section: ReportSection; children?: ReactNode }) {
  const id = `${section.id}-title`;
  return (
    <section aria-labelledby={id} className="card card-body min-w-0">
      <CardTitle id={id} title={section.title} info={section.info} detail={section.basis} />
      {section.table.rows.length === 0 ? <p className="text-small text-muted">{section.empty}</p> : <SectionTable table={section.table} />}
      {children}
    </section>
  );
}

/**
 * The month's deliveries per week, stacked by outcome, inside the outcomes card so its basis is stated once.
 * The values are in its Data table (ADR 0011 §3), each week's total its delivered orders.
 */
function WeeksChart({ report }: { report: MonthlyReport }) {
  const { bars } = reportWeeks(report);
  return (
    <figure aria-labelledby="weeks-title" className="m-0 flex flex-col gap-2">
      <figcaption id="weeks-title" className="text-small font-semibold text-ink-2">
        Per week of delivery
      </figcaption>
      <Chart
        type="stacked-bars"
        series={OUTCOME_SERIES}
        rows={bars.map(({ label, values }) => ({ label, values: { onTime: values.onTime, delayed: values.delayed, exception: values.exception } }))}
        valueFormat="orders"
      />
      <DataTableDisclosure
        table={{
          headers: ["Week", ...OUTCOME_SERIES.map(({ label }) => label), "Delivered"],
          rows: bars.map(({ label, values, delivered }) => [label, ...OUTCOME_SERIES.map(({ key }) => formatCount(values[key])), formatCount(delivered)]),
        }}
      />
    </figure>
  );
}

export interface ReportsPageProps {
  searchParams: Promise<SearchParams>;
}

/** `?month=2025-11`; the anchor's month when none is asked for. */
function readMonth(params: SearchParams, anchor: string): string {
  const asked = Array.isArray(params.month) ? params.month[0] : params.month;
  return asked ?? anchor.slice(0, 7);
}

/**
 * Reports (ticket 34): the place to get data out of the app. The monthly WMS report for a month, read here
 * and downloaded as a PDF or a CSV, and every order as CSV. Every figure comes from domain/definitions
 * through tools/report (ADR 0011 §6); the page and the PDF draw the same sections
 * (components/report-sections), so they say the same thing. A month the data does not cover shows the
 * anchor's, as the other pages leave out what they cannot apply.
 */
export async function ReportsPage({ searchParams, role }: ReportsPageProps & { role: Role }) {
  const dataset = getDataset();
  const report = monthlyReport(dataset, readMonth(await searchParams, dataset.anchor)) ?? monthlyReport(dataset, dataset.anchor.slice(0, 7));
  if (report === undefined) throw new Error("The data has no report for its own anchor month");
  const month = report.current.month;
  const sections = new Map(reportSections(report).map((section) => [section.id, section]));
  const show = (id: SectionId, children?: ReactNode) => {
    const section = sections.get(id);
    return section === undefined ? null : <Section section={section}>{children}</Section>;
  };
  return (
    <>
      <PageHeader label="Reports" title="Reports" asOf={dataset.anchor} />
      <section aria-label="Monthly report" className="card flex flex-wrap items-start justify-between gap-x-6 gap-y-3 p-3.5">
        <MonthPicker path={REPORTS_PATH} months={reportMonths(dataset.orders).map((value) => ({ value, label: monthLabel(value) }))} value={month} />
        <Exports role={role} month={month} />
      </section>
      <CardPair label="Summary" minWidth={580}>
        {show("placed")}
        {show("completed")}
      </CardPair>
      {show("outcomes", <WeeksChart report={report} />)}
      {show("carriers")}
      {show("warehouses")}
      <CardPair label="Top categories and SKUs">
        {show("categories")}
        {show("skus")}
      </CardPair>
      {show("attention")}
    </>
  );
}
