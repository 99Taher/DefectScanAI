variable "resource_group_name" {
  description = "Name of the resource group"
  default     = "defect-detection-rg"
}

variable "location" {
  description = "Azure region for the resources"
  default     = "francecentral"
}

variable "storage_account_name" {
  description = "Name of the storage account (must be globally unique and alphanumeric only)"
  default     = "defectdetectionstor"
}

variable "servicebus_namespace_name" {
  description = "Name of the service bus namespace"
  default     = "defectdetectionbus"
}

variable "acr_name" {
  description = "Name of the Azure Container Registry"
  default     = "defectdetectionacr"
}

variable "aks_name" {
  description = "Name of the AKS cluster"
  default     = "defectdetection-aks"
}
