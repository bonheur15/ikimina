import Image from "next/image";

const illustrations = {
  savings: "/images/portal/savings-card.svg",
  community: "/images/elayo/cooperative.jpeg",
  records: "/images/portal/statement-records-glassy-rwf.png",
} as const;

type Illustration = keyof typeof illustrations;

export function PortalIllustration({
  asset,
  className = "",
  eager = false,
}: {
  asset: Illustration;
  className?: string;
  eager?: boolean;
}) {
  return (
    <Image
      src={illustrations[asset]}
      alt=""
      aria-hidden="true"
      width={768}
      height={768}
      unoptimized
      loading={eager ? "eager" : "lazy"}
      className={`portal-illustration portal-illustration-${asset} ${className}`}
    />
  );
}
