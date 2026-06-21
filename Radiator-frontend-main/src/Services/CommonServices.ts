import { useState, useCallback, useEffect } from 'react';
import debounce from 'lodash.debounce';

// ------------------------------
// Pagination Hook
// ------------------------------

interface PaginationData {
    totalRecords: number;
}

interface PaginationConfig {
    limit: number;
    skip: number;
}

interface PaginationState extends PaginationConfig {
    currentPage: number;
    totalRecords: number;
}

export const usePagination = (
    data: PaginationData,
    dataLimit: PaginationConfig
) => {
    const [selectedDataList, setSelectedDataList] = useState<number>(dataLimit.limit);
    const [pagination, setPagination] = useState<PaginationState>({
        ...dataLimit,
        currentPage: 1,
        totalRecords: data.totalRecords,
    });
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [paginationFunction, setPaginationFunction] = useState<number>(1);

    const totalPages = Math.ceil(
        data.totalRecords / (selectedDataList < 1 ? 1 : selectedDataList)
    );

    const handleNextPage = useCallback(() => {
        if (currentPage < totalPages) {
            const newSkip = pagination.skip + selectedDataList;
            setPagination((prev) => ({ ...prev, skip: newSkip, currentPage: currentPage + 1 }));
            setCurrentPage((prev) => prev + 1);
            setPaginationFunction((prev) => prev + 1);
        }
    }, [currentPage, totalPages, pagination, selectedDataList]);

    const handlePreviousPage = useCallback(() => {
        if (currentPage > 1) {
            const newSkip = pagination.skip - selectedDataList;
            setPagination((prev) => ({ ...prev, skip: newSkip, currentPage: currentPage - 1 }));
            setCurrentPage((prev) => prev - 1);
            setPaginationFunction((prev) => prev + 1);
        }
    }, [currentPage, pagination, selectedDataList]);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            let page = parseInt(e.target.value, 10) || 1;
            if (page < 1) page = 1;
            setSelectedDataList(page);
            setPagination({ limit: page, skip: 0, currentPage: 1, totalRecords: data.totalRecords });
            setCurrentPage(1);
            setPaginationFunction((prev) => prev + 1);
        },
        [data.totalRecords]
    );

    const debouncedHandleChange = useCallback(debounce(handleChange, 200), [handleChange]);

    useEffect(() => {
        return () => {
            debouncedHandleChange.cancel();
        };
    }, [debouncedHandleChange]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        debouncedHandleChange(e);
    };

    return {
        paginationFunction,
        handleNextPage,
        handlePreviousPage,
        handleInputChange,
        totalPages,
        pagination,
        setPagination,
        selectedDataList,
        setSelectedDataList,
        currentPage,
        setCurrentPage,
    };
};

// ------------------------------
// Checkbox Hook
// ------------------------------

interface RecordItem {
    _id: string;
    isChecked?: boolean;
    [key: string]: any;
}

interface BulkOpContext {
    selectAll: boolean;
    uncheckedSelectedItems: string[];
    selectedItems: string[];
}

export const useCheckbox = (
    setRecords: React.Dispatch<React.SetStateAction<RecordItem[]>>
) => {
    const [bulkOpContext, setBulkOpContext] = useState<BulkOpContext>({
        selectAll: false,
        uncheckedSelectedItems: [],
        selectedItems: [],
    });

    const [selectedItemsCount, setSelectedItemsCount] = useState<number>(0);

    const checkboxAllFunction = (type: boolean) => {
        setRecords((records) =>
            records.map((item) => ({ ...item, isChecked: type }))
        );
    };

    const checkboxSingleFunction = (type: boolean, id: string) => {
        setRecords((records) =>
            records.map((item) =>
                item._id === id ? { ...item, isChecked: type } : item
            )
        );
    };

    const handleSelectAllChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const checked = e.target.checked;

        setBulkOpContext({
            selectAll: checked,
            uncheckedSelectedItems: [],
            selectedItems: [],
        });

        checkboxAllFunction(checked);
    }, []);

    const handleCheckboxChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
            const checked = e.target.checked;
            setBulkOpContext((bulk) => {
                const newBulk = { ...bulk };

                if (newBulk.selectAll) {
                    if (!checked) {
                        newBulk.uncheckedSelectedItems.push(id);
                    } else {
                        newBulk.uncheckedSelectedItems = newBulk.uncheckedSelectedItems.filter(
                            (itemId) => itemId !== id
                        );
                    }
                } else {
                    if (checked) {
                        newBulk.selectedItems.push(id);
                    } else {
                        newBulk.selectedItems = newBulk.selectedItems.filter(
                            (itemId) => itemId !== id
                        );
                    }
                }

                setSelectedItemsCount(newBulk.selectedItems.length);
                return newBulk;
            });

            checkboxSingleFunction(checked, id);
        },
        []
    );

    const checkboxFunction = useCallback(() => {
        if (!bulkOpContext.selectAll) {
            checkboxAllFunction(false);
            if (bulkOpContext.selectedItems.length) {
                setRecords((records) =>
                    records.map((item) => {
                        if (bulkOpContext.selectedItems.includes(item._id)) {
                            item.isChecked = true;
                        }
                        return item;
                    })
                );
            }
        } else {
            checkboxAllFunction(true);
            if (bulkOpContext.uncheckedSelectedItems.length) {
                setRecords((records) =>
                    records.map((item) => {
                        if (bulkOpContext.uncheckedSelectedItems.includes(item._id)) {
                            item.isChecked = false;
                        }
                        return item;
                    })
                );
            }
        }
    }, [bulkOpContext]);

    return {
        checkboxFunction,
        handleCheckboxChange,
        handleSelectAllChange,
        bulkOpContext,
        selectedItemsCount,
    };
};

// ------------------------------
// Filter Hook
// ------------------------------

type FilterState = {
    [key: string]: any;
};

export const useFilter = () => {
    const [filter, setFilter] = useState<FilterState>({});

    const loadFilterOption = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>, value: string, scope: string) => {
            const { checked } = event.target;
            setFilter((prevFilters) => {
                const updatedFilters = { ...prevFilters };

                if (!updatedFilters[scope]) {
                    updatedFilters[scope] = [];
                }

                if (checked) {
                    updatedFilters[scope].push(value);
                } else {
                    updatedFilters[scope] = updatedFilters[scope].filter((item: string) => item !== value);
                    if (updatedFilters[scope].length === 0) {
                        delete updatedFilters[scope];
                    }
                }

                return updatedFilters;
            });
        },
        []
    );

    const loadDateFilter = useCallback((selectedDate: string, scope: string) => {
        setFilter((prevFilters) => ({
            ...prevFilters,
            [scope]: selectedDate,
        }));
    }, []);

    const clearSelectedFilter = useCallback((scope: string) => {
        setFilter((prevFilters) => {
            const updatedFilters = { ...prevFilters };
            delete updatedFilters[scope];
            return updatedFilters;
        });
    }, []);

    const clearAllFilter = useCallback(() => {
        const checkboxes = document.querySelectorAll(
            '.filter-container input[type="checkbox"], .filter-container input[type="radio"]'
        ) as NodeListOf<HTMLInputElement>;
        checkboxes.forEach((checkbox) => {
            checkbox.checked = false;
        });
        setFilter({});
    }, []);

    return {
        loadFilterOption,
        clearSelectedFilter,
        clearAllFilter,
        loadDateFilter,
        filter,
    };
};

// ------------------------------
// Sorting Hook
// ------------------------------

type SortOrder = 1 | -1;

export const useSorting = () => {
    const [sortingData, setSortingData] = useState<Record<string, SortOrder>>({});

    const tableSorting = useCallback((e: React.MouseEvent<HTMLElement>, modelName: string) => {
        const thElements = document.querySelectorAll('th.sorting');
        const thisEvent = e.currentTarget as HTMLElement;
        const currentSort = thisEvent.dataset.sort;

        thElements.forEach((th) => {
            th.classList.remove('ascending', 'descending');
            th.removeAttribute('data-sort');
        });

        const newSort = currentSort === '1' ? '-1' : '1';
        thisEvent.dataset.sort = newSort;
        thisEvent.classList.add(newSort === '1' ? 'ascending' : 'descending');

        setSortingData({ [modelName]: parseInt(newSort) as SortOrder });
    }, []);

    return { tableSorting, sortingData };
};
