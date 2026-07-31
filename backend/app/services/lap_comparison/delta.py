"""Delta-time computation for two-lap comparison (M6).

See docs/m6-design-review.md §8.2 for the algorithm and
docs/m6-implementation-plan.md §0.4 for why the sign convention is
re-stated in four separate places across this milestone -- this file is
one of them.
"""

from app.services.lap_comparison.alignment import AlignedLap, FloatArray


def compute_delta_ms(aligned_a: AlignedLap, aligned_b: AlignedLap) -> FloatArray:
    """Cumulative time delta at each distance grid point, in milliseconds.

    Sign convention: positive means lap A is faster (ahead) at that
    distance -- lap B has taken more time than lap A to reach the same
    point on track. This is the single highest-risk line in the whole
    milestone. Do not change this subtraction's operand order without
    re-reading docs/m6-implementation-plan.md §0.4 and updating
    test_lap_comparison_delta.py's dedicated sign-convention test.
    """
    return (aligned_b.time_seconds - aligned_a.time_seconds) * 1000.0
