import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/Button";

interface PageHeaderProps {
  title?: string;
  backLinkHref?: string;
  subheaderSlot?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  backLinkHref,
  subheaderSlot,
  children,
}: PageHeaderProps) {
  return (
    <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            {backLinkHref && (
              <Button variant="ghost" size="icon" asChild>
                <Link href={backLinkHref}>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
            )}
            <div className="flex flex-col gap-1">
              {title ? (
                <h1 className="text-xl font-bold text-gray-100">{title}</h1>
              ) : (
                <Image
                  src="/logo-master.svg"
                  alt="WatchThis"
                  width={179}
                  height={50}
                />
              )}
              {subheaderSlot}
            </div>
          </div>

          {children && (
            <div className="flex items-center gap-3">{children}</div>
          )}
        </div>
      </div>
    </header>
  );
}
