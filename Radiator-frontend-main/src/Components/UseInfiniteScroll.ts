import { useState, useCallback } from "react";
import { AxiosError } from "axios";
import { postData } from "../Services/ApiServices";

interface UseInfiniteScrollProps {
    url: string;
    limit?: number;
    defaultFilters?: any;
    defaultExtraQuery?: any;
}

export const useInfiniteScroll = ({
    url,
    limit = 15,
    defaultFilters = {},
    defaultExtraQuery = {},
}: UseInfiniteScrollProps) => {
    const [data, setData] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);

    const loadMore = useCallback(
        async (isReset: boolean = false) => {
            try {
                setLoading(true);

                const sessionFilters =
                    JSON.parse(sessionStorage.getItem("filter") || "null") || {};
                const search = sessionStorage.getItem("search") || "";

                const query = {
                    page: isReset ? 1 : page,
                    limit,
                    filters: { ...defaultFilters, ...sessionFilters },
                    search,
                    ...defaultExtraQuery,
                };

                const result: any = await postData(url, query);
                const list = result.data?.foodList || [];

                setData((prev) => (isReset ? list : [...prev, ...list]));
                setHasMore(list.length === limit);
                setPage((prev) => (isReset ? 2 : prev + 1));
            } catch (error) {
                const err = error as AxiosError;
                console.error("Scroll Load Error:", err.message);
            } finally {
                setLoading(false);
            }
        },
        [page, url, limit]
    );

    const resetAndLoad = () => {
        setData([]);
        setPage(1);
        setHasMore(true);
        loadMore(true);
    };

    return { data, hasMore, loading, loadMore, resetAndLoad };
};
