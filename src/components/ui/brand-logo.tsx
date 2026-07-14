import Image from "next/image";

type BrandLogoProps = { className?: string; priority?: boolean };

export function BrandLogo({ className = "h-auto w-28", priority = false }: BrandLogoProps) {
  return <Image src="/brand/ekoa-logo.png" alt="Ekoa" width={1320} height={540} className={className} priority={priority} unoptimized />;
}
