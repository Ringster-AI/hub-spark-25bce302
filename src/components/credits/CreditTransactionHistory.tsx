import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { History, TrendingDown, TrendingUp, RotateCcw } from "lucide-react";
import { CreditsService } from "@/services/creditsService";
import { CreditTransaction } from "@/types/credits";

const PAGE_SIZE = 25;

export const CreditTransactionHistory = () => {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadPage = useCallback(async (cursor?: string) => {
    const data = await CreditsService.getCreditTransactions(cursor, PAGE_SIZE);
    setHasMore(data.length === PAGE_SIZE);
    return data;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await loadPage();
        setTransactions(data);
      } catch (error) {
        console.error('Error fetching credit transactions:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadPage]);

  const handleLoadMore = async () => {
    if (transactions.length === 0) return;
    setLoadingMore(true);
    try {
      const cursor = transactions[transactions.length - 1].created_at;
      const next = await loadPage(cursor);
      setTransactions((prev) => [...prev, ...next]);
    } finally {
      setLoadingMore(false);
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deduction':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'addition':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'reset':
        return <RotateCcw className="h-4 w-4 text-blue-500" />;
      default:
        return <History className="h-4 w-4" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'deduction':
        return 'destructive';
      case 'addition':
        return 'success';
      case 'reset':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Credit History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse flex items-center gap-3">
                <div className="h-8 w-8 bg-muted rounded"></div>
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded w-3/4 mb-1"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </div>
                <div className="h-6 w-16 bg-muted rounded"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Credit History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          <div className="space-y-3">
            {transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No credit transactions yet
              </p>
            ) : (
              transactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center gap-3 p-2 rounded-lg border">
                  {getTransactionIcon(transaction.transaction_type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {transaction.description || `${transaction.transaction_type} transaction`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(transaction.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={getTransactionColor(transaction.transaction_type) as any}>
                    {transaction.transaction_type === 'deduction' ? '-' : '+'}
                    {transaction.credits_amount}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        {hasMore && transactions.length > 0 && (
          <div className="pt-3 flex justify-center">
            <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
