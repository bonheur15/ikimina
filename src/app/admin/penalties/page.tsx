import { RegisterPage } from "@/components/register-page";

export default function PenaltiesPage({ searchParams }: PageProps<"/admin/penalties">) {
  return <RegisterPage kind="penalty" searchParams={searchParams} />;
}
