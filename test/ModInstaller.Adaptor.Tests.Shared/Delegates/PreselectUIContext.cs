using FomodInstaller.Interface;
using FomodInstaller.Interface.ui;

namespace ModInstaller.Adaptor.Tests.Shared.Delegates;

/// <summary>
/// Captures the pre-selected state from each step's UpdateState call,
/// then auto-confirms without changing selections. Used to test the
/// preselect mode where a preset pre-selects options but the dialog
/// is still shown.
/// </summary>
public class PreselectUIContext : UIDelegates
{
    private Action<bool, int>? _cont;

    /// <summary>
    /// For each step, the captured option state received in UpdateState.
    /// </summary>
    public List<StepSnapshot> StepSnapshots { get; } = new();

    public override void StartDialog(string moduleName, HeaderImage image, Action<int, int, int[]> select, Action<bool, int> cont, Action cancel)
    {
        _cont = cont;
    }

    public override void EndDialog()
    {
        _cont = null;
    }

    public override void UpdateState(InstallerStep[] installSteps, int currentStep)
    {
        // Capture the state of options for the current step
        var step = installSteps[currentStep];
        var snapshot = new StepSnapshot
        {
            StepIndex = currentStep,
            StepName = step.name,
        };

        if (step.optionalFileGroups?.group != null)
        {
            foreach (var group in step.optionalFileGroups.group)
            {
                if (group.options == null) continue;
                foreach (var option in group.options)
                {
                    snapshot.Options.Add(new OptionSnapshot
                    {
                        GroupName = group.name,
                        OptionName = option.name,
                        Selected = option.selected,
                        Preset = option.preset,
                        Type = option.type,
                    });
                }
            }
        }

        StepSnapshots.Add(snapshot);

        // Auto-confirm without changing selections (same pattern as DeterministicUIContext unattended mode)
        _cont!(true, currentStep);
    }

    public override void ReportError(string title, string message, string details)
    {
        throw new NotImplementedException();
    }
}

public class StepSnapshot
{
    public int StepIndex { get; init; }
    public string StepName { get; init; } = "";
    public List<OptionSnapshot> Options { get; } = new();
}

public class OptionSnapshot
{
    public string GroupName { get; init; } = "";
    public string OptionName { get; init; } = "";
    public bool Selected { get; init; }
    public bool Preset { get; init; }
    public string Type { get; init; } = "";
}
