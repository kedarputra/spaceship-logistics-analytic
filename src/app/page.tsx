import { DashboardCharts } from "@/components/dashboard-charts";
import { KpiCards } from "@/components/kpi-cards";
import { dashboardKpis, delayRateByCarrier, deliveryOutcomesOverTime, orderCountOverTime } from "@/domain/definitions";
import { getDataset } from "@/domain/orders";
import { dataPeriod, formatDate } from "@/domain/periods";

// Rendered per request from the dataset this server instance loaded, like /api/health.
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const { orders, anchor } = getDataset();
  const period = dataPeriod(orders);
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-2 px-4 py-4">
          <h1 className="text-lg font-semibold">Logistics Analytics</h1>
          <p className="text-sm text-slate-600">{`Data as of ${formatDate(anchor)}`}</p>
        </div>
      </header>
      <main aria-label="Dashboard" className="mx-auto max-w-6xl px-4 py-6">
        <KpiCards kpis={dashboardKpis(orders)} />
        <DashboardCharts
          period={period}
          ordersPerMonth={orderCountOverTime(orders, period, "month")}
          outcomesPerMonth={deliveryOutcomesOverTime(orders, period, "month")}
          carriers={delayRateByCarrier(orders, period)}
        />
      </main>
    </div>
  );
}
