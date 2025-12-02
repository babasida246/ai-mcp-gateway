import { useEffect, useState } from 'react';
import { Database as DatabaseIcon, Table, ChevronRight, RefreshCw, Search } from 'lucide-react';
import axios from 'axios';

const API_BASE = 'http://localhost:3000';

interface TableInfo {
  table_name: string;
  row_count: string;
  total_size: string;
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface TableData {
  schema: ColumnInfo[];
  data: Record<string, unknown>[];
  total: number;
}

export default function Database() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage] = useState(50);

  useEffect(() => {
    loadTables();
  }, []);

  useEffect(() => {
    if (selectedTable) {
      loadTableData(selectedTable, currentPage);
    }
  }, [selectedTable, currentPage]);

  async function loadTables() {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/v1/database/tables`);
      setTables(res.data.tables || []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load tables:', err);
      setLoading(false);
    }
  }

  async function loadTableData(tableName: string, page: number) {
    try {
      const offset = (page - 1) * rowsPerPage;
      const res = await axios.get(`${API_BASE}/v1/database/table/${tableName}`, {
        params: { limit: rowsPerPage, offset }
      });
      setTableData(res.data);
    } catch (err) {
      console.error('Failed to load table data:', err);
    }
  }

  const filteredTables = tables.filter(t =>
    t.table_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = tableData ? Math.ceil(tableData.total / rowsPerPage) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DatabaseIcon className="w-8 h-8 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold text-white">Database Management</h1>
            <p className="text-sm text-slate-400">Browse and view PostgreSQL tables</p>
          </div>
        </div>
        <button
          onClick={loadTables}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tables List */}
        <div className="lg:col-span-1">
          <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search tables..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {filteredTables.map((table) => (
                <button
                  key={table.table_name}
                  onClick={() => {
                    setSelectedTable(table.table_name);
                    setCurrentPage(1);
                  }}
                  className={`w-full flex items-center justify-between p-4 border-b border-slate-700 hover:bg-slate-700 transition-colors ${
                    selectedTable === table.table_name ? 'bg-slate-700' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Table className="w-4 h-4 text-blue-400" />
                    <div className="text-left">
                      <div className="text-white font-medium">{table.table_name}</div>
                      <div className="text-xs text-slate-400">
                        {table.row_count} rows · {table.total_size}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              ))}
              {filteredTables.length === 0 && (
                <div className="p-8 text-center text-slate-400">
                  No tables found
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Table Details */}
        <div className="lg:col-span-2">
          {selectedTable && tableData ? (
            <div className="space-y-4">
              {/* Schema */}
              <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-slate-700">
                  <h2 className="text-lg font-semibold text-white">Schema: {selectedTable}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Column
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Nullable
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Default
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {tableData.schema.map((col) => (
                        <tr key={col.column_name} className="hover:bg-slate-700/50">
                          <td className="px-4 py-3 text-sm font-medium text-white">
                            {col.column_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-blue-400">
                            {col.data_type}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {col.is_nullable}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-400">
                            {col.column_default || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Data */}
              <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">
                    Data ({tableData.total} rows)
                  </h2>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 bg-slate-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600"
                      >
                        Previous
                      </button>
                      <span className="text-sm text-slate-400">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 bg-slate-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-slate-900 sticky top-0">
                      <tr>
                        {tableData.schema.map((col) => (
                          <th
                            key={col.column_name}
                            className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap"
                          >
                            {col.column_name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {tableData.data.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-700/50">
                          {tableData.schema.map((col) => (
                            <td
                              key={col.column_name}
                              className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap"
                            >
                              {typeof row[col.column_name] === 'object'
                                ? JSON.stringify(row[col.column_name])
                                : String(row[col.column_name] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tableData.data.length === 0 && (
                    <div className="p-8 text-center text-slate-400">
                      No data in this table
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-12 text-center">
              <Table className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">Select a table to view its data</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
