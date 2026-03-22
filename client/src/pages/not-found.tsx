import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-muted flex items-center justify-center">
          <span className="text-3xl">🔍</span>
        </div>
        <h2 className="text-lg font-bold">頁面不存在</h2>
        <p className="text-sm text-muted-foreground">找不到你要的頁面</p>
        <Link href="/">
          <Button className="gap-2 mt-2">
            <Home className="h-4 w-4" />
            返回首頁
          </Button>
        </Link>
      </div>
    </div>
  );
}
