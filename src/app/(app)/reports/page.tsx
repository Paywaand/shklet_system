"use client";

import { useState } from "react";
import { useLanguage } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { FileText } from "lucide-react";

export default function ReportsPage() {
  const { t } = useLanguage();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [generating, setGenerating] = useState(false);

  function download() {
    setGenerating(true);
    window.open(`/api/reports/monthly?month=${month}`, "_blank");
    setTimeout(() => setGenerating(false), 1000);
  }

  return (
    <div>
      <PageHeader title={t("reports.header")} />
      <Card className="max-w-sm">
        <CardContent className="pt-6">
          <div className="flex justify-center mb-5">
            <div className="h-14 w-14 rounded-2xl bg-shklet-red/10 flex items-center justify-center text-shklet-red">
              <FileText size={26} strokeWidth={1.75} />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <Label>{t("reports.selectMonth")}</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <Button className="w-full" size="lg" onClick={download} loading={generating}>
              {generating ? t("reports.generatingReport") : t("reports.downloadReport")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
