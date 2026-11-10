package prediction_test

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"itsm-backend/common"
	"itsm-backend/ent"
	predictionhandler "itsm-backend/handlers/prediction"
	tickethandler "itsm-backend/handlers/ticket"
	"itsm-backend/router"
	"itsm-backend/service"
)

const predictionPath = "/api/v1/tickets/prediction/export"

func predictionRoutes(t *testing.T) (*gin.Engine, sqlmock.Sqlmock) {
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
		c.Set("tenant_id", 17)
		c.Set("user_id", 91)
		c.Set("role", "super_admin")
		c.Set("client", client)
	})
	// Register the production ticket routes; unrelated handlers are never called.
	router.SetupTicketRoutes(r.Group("/api/v1"), &router.RouterConfig{
		TicketHandler:     &tickethandler.Handler{},
		PredictionHandler: predictionhandler.NewHandler(service.NewPredictionService(client, logger), logger),
	})
	return r, mock
}

func predictionRequest(r *gin.Engine, path, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

func TestPredictionRouteEnglishValidation(t *testing.T) {
	r, _ := predictionRoutes(t)
	for _, tc := range []struct {
		name, query, body, message string
		code                       int
	}{
		{"malformed JSON", "", `{`, "Wrong request parameters", common.ParamErrorCode},
		{"required prediction type", "", `{}`, "Wrong request parameters", common.ParamErrorCode},
		{"unsupported format", "?format=xml", `{"predictionType":"volume"}`, "Unsupported export format, supported: csv, excel, pdf", common.ParamErrorCode},
		{"invalid date", "", `{"predictionType":"volume","timeRange":["invalid","2026-01-08"]}`, "Invalid timeRange start date; expected YYYY-MM-DD", common.BadRequestCode},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := predictionRequest(r, predictionPath+tc.query, tc.body)
			require.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())
			var envelope map[string]any
			require.NoError(t, json.Unmarshal(w.Body.Bytes(), &envelope))
			require.Equal(t, float64(tc.code), envelope["code"])
			require.Equal(t, tc.message, envelope["message"])
			require.NotContains(t, envelope, "data")
		})
	}
}

func TestPredictionHandlerMissingTenantFailsClosed(t *testing.T) {
	r := gin.New()
	r.POST(predictionPath, predictionhandler.NewHandler(nil, nil).ExportPredictionReport)
	w := predictionRequest(r, predictionPath+"?tenantId=17", `{"predictionType":"volume","tenantId":17}`)
	require.Equal(t, http.StatusUnauthorized, w.Code)
	var envelope map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &envelope))
	require.Equal(t, float64(common.UnauthorizedCode), envelope["code"])
	require.Equal(t, "Unauthorized access: Tenant information is missing", envelope["message"])
	require.NotContains(t, envelope, "data")
}

func TestPredictionRouteCSVUsesEnglishHeadersAndAuthenticatedTenant(t *testing.T) {
	r, mock := predictionRoutes(t)
	// Keep the real service's tenant, soft-delete and bounded-history predicates
	// in the contract. Neither body nor query tenantId may change this scope.
	mock.ExpectQuery(`SELECT .* FROM "tickets" WHERE .*"tenant_id" = \$1.*"deleted_at" IS NULL.*"created_at" >= \$2.*"created_at" <= \$3.*`).
		WithArgs(17, time.Date(2025, 7, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 1, 8, 0, 0, 0, 0, time.UTC)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	w := predictionRequest(r, predictionPath+"?tenantId=28", `{"predictionType":"volume","timeRange":["2026-01-01","2026-01-08"],"tenantId":28}`)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, "text/csv", w.Header().Get("Content-Type"))
	require.Regexp(t, `^attachment; filename=prediction_\d{8}_\d{6}\.csv$`, w.Header().Get("Content-Disposition"))
	reader := csv.NewReader(strings.NewReader(strings.TrimPrefix(w.Body.String(), "\xef\xbb\xbf")))
	reader.FieldsPerRecord = -1
	rows, err := reader.ReadAll()
	require.NoError(t, err)
	require.Equal(t, []string{"Date", "Predicted value", "Lower bound", "Upper bound", "Confidence"}, rows[0])
	require.Equal(t, "2026-01-01", rows[1][0])
	require.Equal(t, "2026-01-08", rows[2][0])
	require.Contains(t, rows, []string{"Prediction information"})
	require.Contains(t, rows, []string{"Model", "arima"})
	require.Contains(t, rows, []string{"Overall confidence", "0.85"})
}

func TestPredictionRouteDatabaseFailureUsesSafeEnglishMessage(t *testing.T) {
	r, mock := predictionRoutes(t)
	mock.ExpectQuery(`SELECT .* FROM "tickets" WHERE .*"tenant_id" = \$1.*`).
		WillReturnError(errors.New("database password=private-value"))
	w := predictionRequest(r, predictionPath, `{"predictionType":"volume","timeRange":["2026-01-01","2026-01-08"]}`)
	require.Equal(t, http.StatusInternalServerError, w.Code)
	var envelope map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &envelope))
	require.Equal(t, float64(common.InternalErrorCode), envelope["code"])
	require.Equal(t, "Failed to export forecast report", envelope["message"])
	require.NotContains(t, envelope, "data")
	require.NotContains(t, w.Body.String(), "private-value")
}
