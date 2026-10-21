from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("author/exercises", views.ExerciseViewSet, basename="exercise")
router.register("author/lessons", views.LessonViewSet, basename="lesson")

urlpatterns = [
    path("auth/session/", views.SessionView.as_view()),
    path("auth/login/", views.LoginView.as_view()),
    path("auth/logout/", views.LogoutView.as_view()),
    path("catalog/", views.CatalogView.as_view()),
    path("releases/<uuid:release_id>/", views.ReleaseView.as_view()),
    path("releases/<uuid:release_id>/blocks/<uuid:block_id>/draft/", views.DraftView.as_view()),
    path("releases/<uuid:release_id>/blocks/<uuid:block_id>/attempts/", views.AttemptView.as_view()),
    path("releases/<uuid:release_id>/blocks/<uuid:block_id>/hint/", views.HintView.as_view()),
    path("author/students/", views.StudentsView.as_view()),
    path("author/students/<int:student_id>/attempts/", views.StudentAttemptsView.as_view()),
    path("", include(router.urls)),
]
