import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES,
  MAX_COMPANY_ATTACHMENT_MAX_BYTES,
} from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useTheme } from "../context/ThemeContext";
import { companiesApi } from "../api/companies";
import { assetsApi } from "../api/assets";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Settings, CloudUpload, Download, Upload, AlertTriangle, Palette, Users, Package, RotateCcw, Lock, Monitor, Shield } from "lucide-react";
import { CompanyPatternIcon } from "../components/CompanyPatternIcon";
import {
  Field,
  ToggleField,
} from "../components/agent-config-primitives";

const BYTES_PER_MIB = 1024 * 1024;
const DEFAULT_COMPANY_ATTACHMENT_MAX_MIB = DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES / BYTES_PER_MIB;
const MAX_COMPANY_ATTACHMENT_MAX_MIB = MAX_COMPANY_ATTACHMENT_MAX_BYTES / BYTES_PER_MIB;

type SettingsSection = "general" | "appearance" | "hiring" | "packages" | "secrets" | "instance-general" | "access-control";

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: React.ElementType;
  href?: string;
}

const companyNavItems: NavItem[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "hiring", label: "Hiring", icon: Users },
  { id: "packages", label: "Packages", icon: Package },
  { id: "secrets", label: "Secrets", icon: Lock, href: "/company/secrets" },
];

const instanceNavItems: NavItem[] = [
  { id: "instance-general", label: "General", icon: Monitor, href: "/company/settings/instance" },
  { id: "access-control", label: "Access Control", icon: Shield, href: "/company/settings/instance" },
];

export function CompanySettings() {
  const {
    companies,
    selectedCompany,
    selectedCompanyId,
    setSelectedCompanyId
  } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [attachmentMaxMiB, setAttachmentMaxMiB] = useState(String(DEFAULT_COMPANY_ATTACHMENT_MAX_MIB));
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const [compactSidebar, setCompactSidebar] = useState(false);
  const [showAgentStatusDots, setShowAgentStatusDots] = useState(true);
  const [animatedTransitions, setAnimatedTransitions] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);

  const generalRef = useRef<HTMLDivElement>(null);
  const appearanceRef = useRef<HTMLDivElement>(null);
  const hiringRef = useRef<HTMLDivElement>(null);
  const packagesRef = useRef<HTMLDivElement>(null);

  const sectionRefs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    general: generalRef,
    appearance: appearanceRef,
    hiring: hiringRef,
    packages: packagesRef,
  };

  useEffect(() => {
    if (!selectedCompany) return;
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setBrandColor(selectedCompany.brandColor ?? "");
    setAttachmentMaxMiB(String(Math.round((selectedCompany.attachmentMaxBytes ?? DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES) / BYTES_PER_MIB)));
    setLogoUrl(selectedCompany.logoUrl ?? "");
  }, [selectedCompany]);

  const attachmentMaxBytes = Number.parseInt(attachmentMaxMiB, 10) * BYTES_PER_MIB;
  const attachmentMaxValid =
    Number.isInteger(attachmentMaxBytes)
    && attachmentMaxBytes >= BYTES_PER_MIB
    && attachmentMaxBytes <= MAX_COMPANY_ATTACHMENT_MAX_BYTES;
  const cloudSyncEnabled = experimentalSettings?.enableCloudSync === true;

  const generalDirty =
    !!selectedCompany &&
    (companyName !== selectedCompany.name ||
      description !== (selectedCompany.description ?? "") ||
      brandColor !== (selectedCompany.brandColor ?? "") ||
      attachmentMaxBytes !== (selectedCompany.attachmentMaxBytes ?? DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES));

  const generalMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description: string | null;
      brandColor: string | null;
      attachmentMaxBytes: number;
    }) => companiesApi.update(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const settingsMutation = useMutation({
    mutationFn: (requireApproval: boolean) =>
      companiesApi.update(selectedCompanyId!, {
        requireBoardApprovalForNewAgents: requireApproval
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const syncLogoState = (nextLogoUrl: string | null) => {
    setLogoUrl(nextLogoUrl ?? "");
    void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  };

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) =>
      assetsApi
        .uploadCompanyLogo(selectedCompanyId!, file)
        .then((asset) => companiesApi.update(selectedCompanyId!, { logoAssetId: asset.assetId })),
    onSuccess: (company) => {
      syncLogoState(company.logoUrl);
      setLogoUploadError(null);
    }
  });

  const clearLogoMutation = useMutation({
    mutationFn: () => companiesApi.update(selectedCompanyId!, { logoAssetId: null }),
    onSuccess: (company) => {
      setLogoUploadError(null);
      syncLogoState(company.logoUrl);
    }
  });

  function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    setLogoUploadError(null);
    logoUploadMutation.mutate(file);
  }

  function handleLogoDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.match(/^image\/(png|jpeg|webp|gif|svg\+xml)$/)) {
      setLogoUploadError("Invalid file type. Please upload a PNG, JPEG, WEBP, GIF, or SVG image.");
      return;
    }
    setLogoUploadError(null);
    logoUploadMutation.mutate(file);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
  }

  function handleClearLogo() {
    clearLogoMutation.mutate();
  }

  const archiveMutation = useMutation({
    mutationFn: ({
      companyId,
      nextCompanyId
    }: {
      companyId: string;
      nextCompanyId: string | null;
    }) => companiesApi.archive(companyId).then(() => ({ nextCompanyId })),
    onSuccess: async ({ nextCompanyId }) => {
      if (nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.stats
      });
    }
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Settings" }
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  if (!selectedCompany) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected. Select a company from the switcher above.
      </div>
    );
  }

  function handleSaveGeneral() {
    generalMutation.mutate({
      name: companyName.trim(),
      description: description.trim() || null,
      brandColor: brandColor || null,
      attachmentMaxBytes
    });
  }

  function handleDiscard() {
    if (!selectedCompany) return;
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setBrandColor(selectedCompany.brandColor ?? "");
    setAttachmentMaxMiB(String(Math.round((selectedCompany.attachmentMaxBytes ?? DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES) / BYTES_PER_MIB)));
  }

  function handleNavClick(item: NavItem) {
    if (item.href) return; // let the anchor handle navigation
    setActiveSection(item.id);
    const ref = sectionRefs[item.id];
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function renderNavItem(item: NavItem) {
    const isActive = activeSection === item.id;
    const Icon = item.icon;

    const content = (
      <>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-sm">{item.label}</span>
      </>
    );

    const className = cn(
      "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors cursor-pointer",
      isActive
        ? "bg-[rgba(99,102,241,0.12)] text-[#818CF8]"
        : "text-muted-foreground hover:bg-[#1E2130] hover:text-foreground"
    );

    if (item.href) {
      return (
        <a key={item.id} href={item.href} className={className} onClick={() => setActiveSection(item.id)}>
          {content}
        </a>
      );
    }

    return (
      <button key={item.id} className={className} onClick={() => handleNavClick(item)}>
        {content}
      </button>
    );
  }

  return (
    <div className="flex gap-0 -m-6">
      {/* Settings Navigation */}
      <div className="w-60 bg-sidebar border-r border-border p-6 shrink-0">
        <div className="space-y-1">
          <div className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Company Settings
          </div>
          {companyNavItems.map(renderNavItem)}
        </div>

        <div className="my-4 border-t border-border" />

        <div className="space-y-1">
          <div className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Instance Settings
          </div>
          {instanceNavItems.map(renderNavItem)}
        </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 p-8 max-w-2xl space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-xl font-bold text-foreground">Company Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your organization's profile, appearance, and configuration</p>
        </div>

        {/* General Card */}
        <div id="settings-general" ref={generalRef} className="rounded-[14px] border border-border p-6 bg-card">
          <div className="flex items-center gap-3 pb-4 mb-5 border-b border-border">
            <div className="h-10 w-10 rounded-[10px] bg-primary/15 flex items-center justify-center shrink-0">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">General</h2>
              <p className="text-xs text-muted-foreground">Basic organization information and branding</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Company Name" hint="The display name for your company.">
                <input
                  className="w-full rounded-[10px] border border-border bg-secondary/50 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 placeholder:text-muted-foreground/50"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </Field>
              <Field label="Description" hint="Optional description shown in the company profile.">
                <input
                  className="w-full rounded-[10px] border border-border bg-secondary/50 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 placeholder:text-muted-foreground/50"
                  type="text"
                  value={description}
                  placeholder="Optional company description"
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
            </div>
          </div>
        </div>

        {/* Appearance Card */}
        <div id="settings-appearance" ref={appearanceRef} className="rounded-[14px] border border-border p-6 bg-card">
          <div className="flex items-center gap-3 pb-4 mb-5 border-b border-border">
            <div className="h-10 w-10 rounded-[10px] bg-cyan-500/15 flex items-center justify-center shrink-0">
              <Palette className="h-5 w-5 text-cyan-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Appearance</h2>
              <p className="text-xs text-muted-foreground">Customize the visual theme and branding</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Logo upload */}
            <div className="flex items-start gap-4">
              <div className="shrink-0">
                <CompanyPatternIcon
                  companyName={companyName || selectedCompany.name}
                  logoUrl={logoUrl || null}
                  brandColor={brandColor || null}
                  className="rounded-[14px]"
                />
              </div>
              <div className="flex-1 space-y-3">
                <Field
                  label="Logo"
                  hint="Upload a PNG, JPEG, WEBP, GIF, or SVG logo image."
                >
                  <div className="space-y-2">
                    <div
                      className={cn(
                        "flex items-center gap-3 p-3.5 rounded-[10px] border border-dashed transition-colors cursor-pointer",
                        isDragOver
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary bg-secondary/30"
                      )}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleLogoDrop}
                    >
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                        onChange={handleLogoFileChange}
                        className="hidden"
                        id="logo-upload"
                      />
                      <label htmlFor="logo-upload" className="flex items-center gap-2 cursor-pointer text-sm">
                        <Upload className="h-4 w-4 text-muted-foreground" />
                        <span className="text-primary font-medium">Click to upload</span>
                        <span className="text-muted-foreground">or drag and drop</span>
                      </label>
                    </div>
                    {logoUrl && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleClearLogo}
                          disabled={clearLogoMutation.isPending}
                        >
                          {clearLogoMutation.isPending ? "Removing..." : "Remove logo"}
                        </Button>
                      </div>
                    )}
                    {(logoUploadMutation.isError || logoUploadError) && (
                      <span className="text-xs text-destructive">
                        {logoUploadError ??
                          (logoUploadMutation.error instanceof Error
                            ? logoUploadMutation.error.message
                            : "Logo upload failed")}
                      </span>
                    )}
                    {clearLogoMutation.isError && (
                      <span className="text-xs text-destructive">
                        {clearLogoMutation.error.message}
                      </span>
                    )}
                    {logoUploadMutation.isPending && (
                      <span className="text-xs text-muted-foreground">Uploading logo...</span>
                    )}
                  </div>
                </Field>
              </div>
            </div>

            {/* Brand color */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Brand Color"
                hint="Sets the hue for the company icon."
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="h-10 w-10 rounded-[10px] border-2 border-border cursor-pointer shrink-0"
                    style={{ backgroundColor: brandColor || "#6366f1" }}
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                        setBrandColor(v);
                      }
                    }}
                    placeholder="#6366f1"
                    className="flex-1 rounded-[10px] border border-border bg-secondary/50 px-3.5 py-2.5 text-sm font-mono outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                  {brandColor && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setBrandColor("")}
                      className="text-xs text-muted-foreground"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </Field>
              <Field
                label="Attachment Size Limit"
                hint={`Accepted range: 1-${MAX_COMPANY_ATTACHMENT_MAX_MIB} MiB.`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={MAX_COMPANY_ATTACHMENT_MAX_MIB}
                    step={1}
                    value={attachmentMaxMiB}
                    onChange={(e) => setAttachmentMaxMiB(e.target.value)}
                    className="w-28 rounded-[10px] border border-border bg-secondary/50 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                  <span className="text-xs text-muted-foreground">MiB</span>
                  {!attachmentMaxValid && (
                    <span className="text-xs text-destructive">
                      1-{MAX_COMPANY_ATTACHMENT_MAX_MIB}
                    </span>
                  )}
                </div>
              </Field>
            </div>

            {/* Appearance Toggles */}
            <div className="border-t border-border pt-1">
              <div className="text-sm font-semibold text-foreground mb-2 pt-4">Display Preferences</div>

              {/* Dark Mode Toggle */}
              <div className="flex items-center justify-between py-3.5 border-b border-border">
                <div>
                  <div className="text-sm font-medium text-foreground">Dark Mode</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Use dark color scheme throughout the application</div>
                </div>
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className={cn(
                    "h-6 w-11 rounded-full transition-colors relative",
                    theme === "dark" ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "absolute h-[18px] w-[18px] rounded-full bg-white top-[3px] transition-all",
                      theme === "dark" ? "left-[23px]" : "left-[3px]"
                    )}
                  />
                </button>
              </div>

              {/* Compact Sidebar Toggle */}
              <div className="flex items-center justify-between py-3.5 border-b border-border">
                <div>
                  <div className="text-sm font-medium text-foreground">Compact Sidebar</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Collapse the sidebar to icon-only mode by default</div>
                </div>
                <button
                  onClick={() => setCompactSidebar(!compactSidebar)}
                  className={cn(
                    "h-6 w-11 rounded-full transition-colors relative",
                    compactSidebar ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "absolute h-[18px] w-[18px] rounded-full bg-white top-[3px] transition-all",
                      compactSidebar ? "left-[23px]" : "left-[3px]"
                    )}
                  />
                </button>
              </div>

              {/* Show Agent Status Dots Toggle */}
              <div className="flex items-center justify-between py-3.5 border-b border-border">
                <div>
                  <div className="text-sm font-medium text-foreground">Show Agent Status Dots</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Display real-time status indicators next to agent names</div>
                </div>
                <button
                  onClick={() => setShowAgentStatusDots(!showAgentStatusDots)}
                  className={cn(
                    "h-6 w-11 rounded-full transition-colors relative",
                    showAgentStatusDots ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "absolute h-[18px] w-[18px] rounded-full bg-white top-[3px] transition-all",
                      showAgentStatusDots ? "left-[23px]" : "left-[3px]"
                    )}
                  />
                </button>
              </div>

              {/* Animated Transitions Toggle */}
              <div className="flex items-center justify-between py-3.5">
                <div>
                  <div className="text-sm font-medium text-foreground">Animated Transitions</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Enable smooth animations when switching between pages</div>
                </div>
                <button
                  onClick={() => setAnimatedTransitions(!animatedTransitions)}
                  className={cn(
                    "h-6 w-11 rounded-full transition-colors relative",
                    animatedTransitions ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "absolute h-[18px] w-[18px] rounded-full bg-white top-[3px] transition-all",
                      animatedTransitions ? "left-[23px]" : "left-[3px]"
                    )}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Hiring Card */}
        <div id="settings-hiring" ref={hiringRef} className="rounded-[14px] border border-border p-6 bg-card" data-testid="company-settings-team-section">
          <div className="flex items-center gap-3 pb-4 mb-5 border-b border-border">
            <div className="h-10 w-10 rounded-[10px] bg-emerald-500/15 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Hiring</h2>
              <p className="text-xs text-muted-foreground">Control how new agents are onboarded</p>
            </div>
          </div>
          <ToggleField
            label="Require board approval for new hires"
            hint="New agent hires stay pending until approved by board."
            checked={!!selectedCompany.requireBoardApprovalForNewAgents}
            onChange={(v) => settingsMutation.mutate(v)}
            toggleTestId="company-settings-team-approval-toggle"
          />
        </div>

        {/* Packages Card */}
        <div id="settings-packages" ref={packagesRef} className="rounded-[14px] border border-border p-6 bg-card">
          <div className="flex items-center gap-3 pb-4 mb-5 border-b border-border">
            <div className="h-10 w-10 rounded-[10px] bg-amber-500/15 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Company Packages</h2>
              <p className="text-xs text-muted-foreground">Import and export company configuration</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Import and export have moved to dedicated pages accessible from the{" "}
            <a href="/org" className="underline hover:text-foreground text-primary">Org Chart</a> header.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {cloudSyncEnabled ? (
              <Button size="sm" asChild>
                <a href="/company/settings/cloud-upstream">
                  <CloudUpload className="mr-1.5 h-3.5 w-3.5" />
                  Send to Humanless AI Cloud
                </a>
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <a href="/company/export">
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href="/company/import">
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Import
              </a>
            </Button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="rounded-[14px] border-[1.5px] border-red-500/25 p-6 bg-card">
          <div className="flex items-center gap-2.5 pb-4 mb-5 border-b border-red-500/15">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <h2 className="text-base font-semibold text-red-500">Danger Zone</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            These actions are irreversible. Archiving this company will hide it from the sidebar and persists in the database. Please be certain before proceeding.
          </p>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="destructive"
              disabled={
                archiveMutation.isPending ||
                selectedCompany.status === "archived"
              }
              onClick={() => {
                if (!selectedCompanyId) return;
                const confirmed = window.confirm(
                  `Archive company "${selectedCompany.name}"? It will be hidden from the sidebar.`
                );
                if (!confirmed) return;
                const nextCompanyId =
                  companies.find(
                    (company) =>
                      company.id !== selectedCompanyId &&
                      company.status !== "archived"
                  )?.id ?? null;
                archiveMutation.mutate({
                  companyId: selectedCompanyId,
                  nextCompanyId
                });
              }}
            >
              {archiveMutation.isPending
                ? "Archiving..."
                : selectedCompany.status === "archived"
                ? "Already archived"
                : "Archive company"}
            </Button>
            {archiveMutation.isError && (
              <span className="text-xs text-destructive">
                {archiveMutation.error instanceof Error
                  ? archiveMutation.error.message
                  : "Failed to archive company"}
              </span>
            )}
          </div>
        </div>

        {/* Save Bar */}
        {generalDirty && (
          <div className="flex items-center justify-between rounded-[14px] border border-border px-6 py-4 bg-card">
            <span className="text-sm text-muted-foreground">You have unsaved changes</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDiscard}
                className="gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Discard
              </Button>
              <Button
                size="sm"
                onClick={handleSaveGeneral}
                disabled={generalMutation.isPending || !companyName.trim() || !attachmentMaxValid}
                className="gap-1.5 bg-gradient-to-r from-primary to-primary/90 shadow-[0_2px_8px_rgba(99,102,241,0.3)]"
              >
                {generalMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
            {generalMutation.isSuccess && (
              <span className="text-xs text-emerald-500">Saved</span>
            )}
            {generalMutation.isError && (
              <span className="text-xs text-destructive">
                {generalMutation.error instanceof Error
                    ? generalMutation.error.message
                    : "Failed to save"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
