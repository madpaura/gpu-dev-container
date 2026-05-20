
import React, { useState } from 'react';
import { 
  Upload, 
  FolderPlus, 
  Grid3x3, 
  List, 
  ArrowUpDown, 
  Home, 
  ChevronRight, 
  Folder,
  FileText,
  Image,
  Play,
  FileSpreadsheet,
  Archive,
  MoreHorizontal,
  Download,
  Edit,
  Trash2
} from 'lucide-react';
import { Button } from '../components/ui/button';

interface FileItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  size?: string;
  items?: number;
  icon: React.ElementType;
  color: string;
}

export const UserFileBrowser: React.FC = () => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const quickAccess = [
    { name: 'Home', icon: Home },
    { name: 'Documents', icon: FileText },
    { name: 'Images', icon: Image },
    { name: 'Videos', icon: Play },
    { name: 'Music', icon: Play },
    { name: 'Trash', icon: Trash2 },
  ];

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Documents', path: '/documents' },
    { name: 'Projects', path: '/documents/projects' },
  ];

  const files: FileItem[] = [
    { 
      id: '1', 
      name: 'Project Files', 
      type: 'folder', 
      items: 12, 
      icon: Folder, 
      color: 'text-blue-500' 
    },
    { 
      id: '2', 
      name: 'Images', 
      type: 'folder', 
      items: 45, 
      icon: Folder, 
      color: 'text-green-500' 
    },
    { 
      id: '3', 
      name: 'Report.pdf', 
      type: 'file', 
      size: '2.4 MB', 
      icon: FileText, 
      color: 'text-red-500' 
    },
    { 
      id: '4', 
      name: 'index.html', 
      type: 'file', 
      size: '1.2 kB', 
      icon: FileText, 
      color: 'text-purple-500' 
    },
    { 
      id: '5', 
      name: 'banner.jpg', 
      type: 'file', 
      size: '5.8 MB', 
      icon: Image, 
      color: 'text-orange-500' 
    },
    { 
      id: '6', 
      name: 'data.xlsx', 
      type: 'file', 
      size: '3.1 MB', 
      icon: FileSpreadsheet, 
      color: 'text-green-600' 
    },
    { 
      id: '7', 
      name: 'demo.mp4', 
      type: 'file', 
      size: '24.7 MB', 
      icon: Play, 
      color: 'text-blue-600' 
    },
    { 
      id: '8', 
      name: 'backup.zip', 
      type: 'file', 
      size: '15.2 MB', 
      icon: Archive, 
      color: 'text-yellow-600' 
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">File Manager</h1>
        <p className="text-muted-foreground">Manage files within your containers</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="lg:w-64">
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Quick Access</h3>
            <div className="space-y-1">
              {quickAccess.map((item, index) => (
                <button
                  key={index}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          <div className="bg-card border border-border rounded-xl">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 border-b border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={index}>
                    <button className="hover:text-foreground transition-colors">
                      {crumb.name}
                    </button>
                    {index < breadcrumbs.length - 1 && (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </React.Fragment>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload File
                </Button>
                <Button variant="outline" size="sm">
                  <FolderPlus className="w-4 h-4 mr-2" />
                  New Folder
                </Button>
                <div className="flex border border-border rounded-lg">
                  <button
                    className={`p-2 ${viewMode === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground'} hover:text-foreground transition-colors`}
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid3x3 className="w-4 h-4" />
                  </button>
                  <button
                    className={`p-2 ${viewMode === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground'} hover:text-foreground transition-colors`}
                    onClick={() => setViewMode('list')}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
                <Button variant="outline" size="sm">
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  Sort
                </Button>
              </div>
            </div>

            {/* File Grid */}
            {viewMode === 'grid' ? (
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="group relative bg-background border border-border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex flex-col items-center text-center space-y-3">
                        <div className={`${file.color}`}>
                          <file.icon className="w-12 h-12" />
                        </div>
                        <div className="w-full">
                          <p className="text-sm font-medium text-foreground truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {file.type === 'folder' 
                              ? `${file.items} items` 
                              : file.size
                            }
                          </p>
                        </div>
                      </div>
                      
                      {/* Action Menu */}
                      <button className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 hover:bg-muted rounded transition-all">
                        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* List View */
              <div className="p-6">
                <div className="space-y-2">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="group flex items-center justify-between p-3 hover:bg-muted rounded-lg transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`${file.color}`}>
                          <file.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {file.type === 'folder' 
                              ? `${file.items} items` 
                              : file.size
                            }
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1 hover:bg-background rounded">
                          <Download className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button className="p-1 hover:bg-background rounded">
                          <Edit className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button className="p-1 hover:bg-background rounded">
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pagination */}
            <div className="flex items-center justify-center gap-2 p-6 border-t border-border">
              <button className="px-3 py-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">
                Previous
              </button>
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((page) => (
                  <button
                    key={page}
                    className={`w-8 h-8 text-sm rounded ${
                      page === 1 
                        ? 'bg-primary text-primary-foreground' 
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <span className="px-2 text-sm text-muted-foreground">...</span>
              </div>
              <button className="px-3 py-1 text-sm text-muted-foreground hover:text-foreground">
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
