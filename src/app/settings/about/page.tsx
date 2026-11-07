"use client";
import { Paper } from "@mantine/core";
import { About } from "@/components/DataAbout";
import { SubPage } from "@/components/settings/kit";

export default function AboutPage() {
  return (
    <SubPage title="关于">
      <Paper className="surface" radius="xl" p="lg"><About /></Paper>
    </SubPage>
  );
}
