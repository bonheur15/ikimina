import { RegisterPage } from "@/components/register-page";

export default function ContributionsPage({ searchParams }: PageProps<"/admin/contributions">) {
  return <RegisterPage kind="savings" searchParams={searchParams} />;
}
