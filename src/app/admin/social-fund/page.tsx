import { RegisterPage } from "@/components/register-page";

export default function SocialFundPage({ searchParams }: PageProps<"/admin/social-fund">) {
  return <RegisterPage kind="social" searchParams={searchParams} />;
}
