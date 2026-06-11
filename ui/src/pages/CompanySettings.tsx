import { ChangeEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES,
  MAX_COMPANY_ATTACHMENT_MAX_BYTES,
} from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { assetsApi } from "../api/assets";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Settings, CloudUpload, Download, Upload, AlertTriangle, Palette, Users, Package, RotateCcw } from "lucide-react";
import { CompanyPatternIcon } from "../components/CompanyPatternIcon";
import {
  Field,
  ToggleField,
} from "../components/agent-config-primitives";

const BYTES_PER_MIB = 1024 * 1024;
const DEFAULT_COMPANY_ATTACHMENT_MAX_MIB = DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES / BYTES_PER_MIB;
const MAX_COMPANY_ATTACHMENT_MAX_MIB = MAX_COMPANY_ATTACHMENT_MAX_BYTES / BYTES_PER_MIB;

export function CompanySettings() {
  const {
    companies,
    selectedCompany,
    selectedCompanyId,
    setSelectedCompanyId
  } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
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

  return (
    <div className="max-w-2xl space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Company Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your organization's profile, appearance, and configuration</p>
      </div>

      {/* General Card */}
      <div className="rounded-[14px] border border-border p-6 bg-card">
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
      <div className="rounded-[14px] border border-border p-6 bg-card">
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
                  <div className="flex items-center gap-3 p-3.5 rounded-[10px] border border-dashed border-border hover:border-primary bg-secondary/30 transition-colors cursor-pointer">
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
        </div>
      </div>

      {/* Hiring Card */}
      <div className="rounded-[14px] border border-border p-6 bg-card" data-testid="company-settings-team-section">
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
      <div className="rounded-[14px] border border-border p-6 bg-card">
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
  );
}
