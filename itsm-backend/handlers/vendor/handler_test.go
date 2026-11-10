package vendor_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"itsm-backend/common"
	"itsm-backend/ent"
	vendorhandler "itsm-backend/handlers/vendor"
	"itsm-backend/router"
	"itsm-backend/service"
)

// These tests use the production route registration, handler, service and Ent
// query builder. Only the database transport is replaced; predicates and DTO
// mapping therefore remain part of the HTTP contract under test.
func vendorRoutes(t *testing.T, tenant int) (*gin.Engine, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	client := ent.NewClient(ent.Driver(entsql.OpenDB(dialect.Postgres, db)))
	t.Cleanup(func() {
		require.NoError(t, mock.ExpectationsWereMet())
		mock.ExpectClose()
		require.NoError(t, client.Close())
	})
	logger := zap.NewNop().Sugar()
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("tenant_id", tenant)
		c.Set("role", "super_admin")
		c.Set("client", client)
	})
	router.SetupVendorRoutes(r.Group("/api/v1"), vendorhandler.NewHandler(service.NewVendorService(client, logger), logger))
	return r, mock
}

func vendorRequest(t *testing.T, r *gin.Engine, method, path, body string, status, code int, message string) map[string]any {
	t.Helper()
	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	require.Equal(t, status, w.Code, w.Body.String())
	var envelope map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &envelope))
	require.Equal(t, float64(code), envelope["code"])
	require.Equal(t, message, envelope["message"])
	return envelope
}

func TestVendorRoutesEnglishValidation(t *testing.T) {
	r, _ := vendorRoutes(t, 17)
	vendorRequest(t, r, http.MethodPost, "/api/v1/vendors", `{}`, http.StatusBadRequest, common.ParamErrorCode, "Parameter error")
	for _, id := range []string{"abc", "0", "-1"} {
		for _, method := range []string{http.MethodGet, http.MethodDelete} {
			vendorRequest(t, r, method, "/api/v1/vendors/"+id, "", http.StatusBadRequest, common.ParamErrorCode, "Supplier ID format error")
		}
	}
}

func TestVendorHandlerRejectsUntrustedTenant(t *testing.T) {
	for _, tc := range []struct {
		name    string
		tenant  any
		message string
	}{
		{"missing", nil, "Tenant information is missing"},
		{"wrong type", "17", "Tenant information format error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := gin.New()
			r.Use(func(c *gin.Context) {
				if tc.tenant != nil {
					c.Set("tenant_id", tc.tenant)
				}
			})
			// A nil service ensures rejection happens before any persistence call.
			r.GET("/api/v1/vendors", vendorhandler.NewHandler(nil, nil).ListVendors)
			vendorRequest(t, r, http.MethodGet, "/api/v1/vendors?tenantId=17", "", http.StatusUnauthorized, common.UnauthorizedCode, tc.message)
		})
	}
}

func TestVendorRoutesSuccessAndCrossTenantNotFound(t *testing.T) {
	r, mock := vendorRoutes(t, 17)
	query := `SELECT .* FROM "vendors" WHERE "vendors"\."id" = \$1 AND "vendors"\."tenant_id" = \$2 LIMIT 1`
	// Database column names stay snake_case; the public response must not.
	mock.ExpectQuery(query).WithArgs(71, 17).WillReturnRows(sqlmock.NewRows([]string{"id", "name", "code", "vendor_type", "tenant_id"}).AddRow(71, "Example supplier", "supplier-71", "hardware", 17))
	envelope := vendorRequest(t, r, http.MethodGet, "/api/v1/vendors/71?tenantId=28", "", http.StatusOK, common.SuccessCode, "success")
	data, ok := envelope["data"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "hardware", data["vendorType"])
	require.Equal(t, float64(17), data["tenantId"])
	for _, key := range []string{"vendor_type", "tenant_id", "edges", "password", "secret"} {
		require.NotContains(t, data, key)
	}

	// The same ID queried by another authenticated tenant must use that tenant's
	// predicate and return the same safe not-found message as an absent record.
	other, otherMock := vendorRoutes(t, 28)
	otherMock.ExpectQuery(query).WithArgs(71, 28).WillReturnRows(sqlmock.NewRows([]string{"id"}))
	denied := vendorRequest(t, other, http.MethodGet, "/api/v1/vendors/71?tenantId=17", "", http.StatusNotFound, common.NotFoundCode, "Supplier does not exist or does not have access")
	require.NotContains(t, denied, "data")
}
